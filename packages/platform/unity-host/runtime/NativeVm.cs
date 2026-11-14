using System;
using System.Runtime.InteropServices;
using System.Text;

namespace QuaEngine.Unity
{
    // Unity main-thread owner. Every instance gets a separate QuickJS realm.
    internal sealed class NativeVm : IDisposable
    {
        [StructLayout(LayoutKind.Sequential)]
        internal struct Reply { public IntPtr data; public UIntPtr length; }
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
        internal delegate int Callback(IntPtr user, IntPtr method, UIntPtr methodLength,
            IntPtr payload, UIntPtr payloadLength, IntPtr bytes, UIntPtr bytesLength, out Reply reply);

        const string Library = "quajs_unity_runtime";
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] static extern ulong qua_unity_create(byte[] source, UIntPtr length, Callback callback, IntPtr user);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] static extern int qua_unity_tick(ulong id, double now, byte[] events, UIntPtr length);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] static extern int qua_unity_shutdown(ulong id);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] static extern int qua_unity_is_closed(ulong id);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] static extern int qua_unity_drop(ulong id);
        [DllImport(Library, CallingConvention = CallingConvention.Cdecl)] static extern UIntPtr qua_unity_last_error([Out] byte[] output, UIntPtr capacity);

        static readonly Callback callback = Dispatch;
        readonly Func<string, string, byte[], byte[]> bridge;
        GCHandle owner;
        GCHandle replyPin;
        ulong id;
        internal bool IsDispatching { get; private set; }

        internal NativeVm(string source, Func<string, string, byte[], byte[]> bridge)
        {
            this.bridge = bridge;
            owner = GCHandle.Alloc(this);
            try
            {
                var bytes = Encoding.UTF8.GetBytes(source);
                id = qua_unity_create(bytes, (UIntPtr)bytes.Length, callback, GCHandle.ToIntPtr(owner));
                if (id == 0) throw new InvalidOperationException(LastError());
            }
            catch { Dispose(); throw; }
        }

        internal void Tick(double now, string events)
        {
            if (id == 0) throw new ObjectDisposedException(nameof(NativeVm));
            var bytes = Encoding.UTF8.GetBytes(events);
            if (qua_unity_tick(id, now, bytes, (UIntPtr)bytes.Length) == 0)
                throw new InvalidOperationException(LastError());
        }

        internal void Shutdown(double now)
        {
            if (id == 0) return;
            if (qua_unity_shutdown(id) == 0) throw new InvalidOperationException(LastError());
            // The static host performs synchronous file/resource operations. Bound
            // promise draining; the component still releases native resources if a
            // business plugin never settles its shutdown promise.
            for (int i = 0; i < 32 && qua_unity_is_closed(id) == 0; i++) Tick(now, "[]");
            if (qua_unity_is_closed(id) == 0)
                throw new TimeoutException("QuaEngine session shutdown did not settle; native resources will be released.");
        }

        static string LastError()
        {
            int count = checked((int)qua_unity_last_error(null, UIntPtr.Zero).ToUInt64());
            var bytes = new byte[count];
            qua_unity_last_error(bytes, (UIntPtr)bytes.Length);
            return Encoding.UTF8.GetString(bytes);
        }

        static byte[] Read(IntPtr data, UIntPtr length)
        {
            int count = checked((int)length.ToUInt64());
            if (count < 0 || count > 512 * 1024 * 1024) throw new ArgumentOutOfRangeException(nameof(length));
            var bytes = new byte[count];
            if (count != 0) Marshal.Copy(data, bytes, 0, count);
            return bytes;
        }

        [AOT.MonoPInvokeCallback(typeof(Callback))]
        static int Dispatch(IntPtr user, IntPtr method, UIntPtr methodLength, IntPtr payload,
            UIntPtr payloadLength, IntPtr bytes, UIntPtr bytesLength, out Reply reply)
        {
            reply = default;
            NativeVm vm = null;
            byte[] result;
            int status = 0;
            try
            {
                vm = (NativeVm)GCHandle.FromIntPtr(user).Target;
                vm.IsDispatching = true;
                result = vm.bridge(Encoding.UTF8.GetString(Read(method, methodLength)),
                    Encoding.UTF8.GetString(Read(payload, payloadLength)), Read(bytes, bytesLength));
            }
            catch (Exception error) { result = Encoding.UTF8.GetBytes(error.ToString()); status = 1; }
            // No managed exception may cross the reverse P/Invoke boundary.
            if (vm == null) return 1;
            vm.IsDispatching = false;
            try
            {
                if (vm.replyPin.IsAllocated) vm.replyPin.Free();
                if (result == null) result = Array.Empty<byte>();
                vm.replyPin = GCHandle.Alloc(result, GCHandleType.Pinned);
                reply.data = vm.replyPin.AddrOfPinnedObject(); reply.length = (UIntPtr)result.Length;
                return status;
            }
            catch { return 1; }
        }

        public void Dispose()
        {
            if (id != 0) { qua_unity_drop(id); id = 0; }
            if (replyPin.IsAllocated) replyPin.Free();
            if (owner.IsAllocated) owner.Free();
        }
    }
}
