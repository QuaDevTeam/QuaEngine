"""Link the pinned Android arm64 JavaScriptCore C API with 16 KiB page support."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request


NATIVE = Path(__file__).resolve().parents[1]
RUNTIME = NATIVE / "crates/quajs_native_runtime"
ARCHIVES = ("JavaScriptCore", "WTF", "bmalloc", "icui18n", "icuuc", "icudata")


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ndk_compiler(location, version):
    if location is None:
        for name in ("ANDROID_NDK_HOME", "ANDROID_NDK_ROOT", "ANDROID_NDK"):
            if os.environ.get(name):
                location = Path(os.environ[name])
                break
    if location is None:
        sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
        if sdk:
            location = Path(sdk) / "ndk" / version
    if location is None:
        raise ValueError(f"Set ANDROID_NDK_HOME or pass --ndk for Android NDK {version}")
    properties = (location / "source.properties").read_text()
    if not re.search(rf"^Pkg\.Revision\s*=\s*{re.escape(version)}\s*$", properties, re.M):
        raise ValueError(f"The pinned JavaScriptCore build requires Android NDK {version}")
    platform = {"darwin": "darwin-x86_64", "linux": "linux-x86_64", "win32": "windows-x86_64"}[sys.platform]
    binary = "clang++.exe" if sys.platform == "win32" else "clang++"
    return location / "toolchains/llvm/prebuilt" / platform / "bin" / binary


def link(archive, directory, compiler, min_sdk):
    libraries = [f"lib{name}.a" for name in ARCHIVES]
    members = {f"bun-webkit/lib/{lib}": lib for lib in libraries}
    # Stream only the exact archive members used by the linker.
    with tarfile.open(archive, "r|gz") as package:
        for member in package:
            filename = members.pop(member.name, None)
            if filename is None:
                continue
            if not member.isfile():
                raise ValueError(f"Expected regular archive member {member.name}")
            with package.extractfile(member) as source, (directory / filename).open("wb") as output:
                shutil.copyfileobj(source, output)
    if members:
        raise ValueError(f"Missing static libraries: {list(members.values())}")

    # Expose exactly the contract the mobile evaluator and its watchdog use.
    symbols = sorted({
        symbol for file in ("mobile_ffi.rs", "value.rs")
        for symbol in re.findall(r"fn (JS\w+)\(", (RUNTIME / "src/jsc" / file).read_text())
    })
    (directory / "api.map").write_text("{ global: " + "; ".join(symbols) + "; local: *; };")
    subprocess.run([
        compiler.absolute(), f"--target=aarch64-linux-android{min_sdk}", "-shared",
        "-Wl,-z,max-page-size=16384", "-Wl,-z,defs", "-Wl,-soname,libjsc.so",
        "-Wl,--gc-sections", "-Wl,-s", "-Wl,--version-script=api.map", "-o", "libjsc.so",
        *(f"-Wl,-u,{symbol}" for symbol in symbols),
        "-Wl,--start-group", *libraries, "-Wl,--end-group",
        "-llog", "-landroid", "-ldl", "-lm", "-latomic", "-static-libstdc++",
    ], cwd=directory, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="QUA_ANDROID_JSC_LIB_DIR")
    parser.add_argument("--ndk", type=Path, help="Pinned Android NDK directory")
    parser.add_argument("--archive", type=Path, help="Use a previously downloaded JSConly archive")
    args = parser.parse_args()
    pin = json.loads((RUNTIME / "mobile-jsc.json").read_text())["android"]
    directory = args.destination.resolve()
    library = directory / "libjsc.so"
    if library.exists() and sha256(library) == pin["librarySha256"]:
        print(directory)
        return

    compiler = ndk_compiler(args.ndk, pin["ndkVersion"])
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=directory) as staging:
        path = Path(staging)
        archive = args.archive
        if archive is None:
            archive = path / "bun-webkit.tar.gz"
            with urllib.request.urlopen(pin["archiveUrl"], timeout=120) as response, archive.open("wb") as output:
                shutil.copyfileobj(response, output)
        if sha256(archive) != pin["archiveSha256"]:
            raise ValueError("Android JavaScriptCore archive checksum mismatch")
        link(archive, path, compiler, pin["minSdk"])
        if sha256(path / "libjsc.so") != pin["librarySha256"]:
            raise ValueError("The linked Android JavaScriptCore library does not match the pinned binary")
        os.replace(path / "libjsc.so", library)
    print(directory)


if __name__ == "__main__":
    main()
