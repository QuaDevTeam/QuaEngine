/** Static macOS audio product; imported clips only, bounded decoded PCM and processing. */
export const CREATOR_MAC_AUDIO_SOURCE = String.raw`
#import <AVFoundation/AVFoundation.h>
#include "bindings/jswrapper/SeApi.h"
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <map>
#include <memory>
#include <mutex>
#include <vector>
namespace {
constexpr double outputRate = 44100;
constexpr size_t maxBytes = 256 * 1024 * 1024;
struct Filter { std::array<double,5> c{}; double z1[2]{}, z2[2]{}; };
struct Track {
  std::vector<float> pcm;
  std::array<Filter,48> filters{};
  size_t filterCount = 0, frames = 0;
  double sampleRate = 44100, position = 0, gain = 1, rate = 1;
  bool playing = false, loop = false, ended = false;
  std::array<float,4096> output{};
  size_t outputCursor = 0, outputCount = 0;
};
std::mutex controls;
std::map<int,std::shared_ptr<Track>> tracks;
size_t decodedBytes = 0;
int serial = 0;
AVAudioEngine *engine = nil;
AVAudioSourceNode *source = nil;
bool startEngine() {
  if (!engine) {
    engine = [[AVAudioEngine alloc] init];
    AVAudioFormat *format = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:outputRate channels:2];
    source = [[AVAudioSourceNode alloc] initWithFormat:format renderBlock:^OSStatus(BOOL *silent, const AudioTimeStamp *, AVAudioFrameCount count, AudioBufferList *buffers) {
      std::lock_guard<std::mutex> lock(controls);
      for (UInt32 ch=0; ch<buffers->mNumberBuffers; ++ch) std::fill_n(static_cast<float*>(buffers->mBuffers[ch].mData), count, 0.f);
      bool active = false;
      for (auto &entry : tracks) {
        Track &t = *entry.second;
        if (!t.playing || !t.frames) continue;
        active = true;
        for (size_t frame=0; frame<count; ++frame) {
          if (t.position >= t.frames) {
            if (t.loop) t.position = std::fmod(t.position, static_cast<double>(t.frames));
            else { t.position = t.frames; t.playing = false; t.ended = true; break; }
          }
          size_t a = static_cast<size_t>(t.position), b = a+1 < t.frames ? a+1 : t.loop ? 0 : a;
          double mix = t.position-a;
          for (size_t channel=0; channel<2; ++channel) {
            double value = (t.pcm[a*2+channel]*(1-mix)+t.pcm[b*2+channel]*mix)*t.gain;
            for (size_t i=0; i<t.filterCount; ++i) {
              auto &f=t.filters[i];
              double out=f.c[0]*value+f.z1[channel];
              f.z1[channel]=f.c[1]*value-f.c[3]*out+f.z2[channel];
              f.z2[channel]=f.c[2]*value-f.c[4]*out;
              value=out;
            }
            if (channel<buffers->mNumberBuffers) static_cast<float*>(buffers->mBuffers[channel].mData)[frame]+=static_cast<float>(value);
            if (!channel) { t.output[t.outputCursor]=static_cast<float>(value); t.outputCursor=(t.outputCursor+1)%t.output.size(); t.outputCount=std::min(t.outputCount+1,t.output.size()); }
          }
          t.position += t.sampleRate/outputRate*t.rate;
        }
      }
      *silent = !active;
      return noErr;
    }];
    [engine attachNode:source];
    [engine connect:source to:engine.mainMixerNode format:format];
    [format release];
  }
  NSError *error = nil;
  return engine.running || [engine startAndReturnError:&error];
}
std::shared_ptr<Track> find(const se::ValueArray &args) {
  if (args.empty() || !args[0].isNumber()) return {};
  auto it=tracks.find(args[0].toInt32()); return it==tracks.end()?nullptr:it->second;
}
void field(se::Object *obj,const char *name,double value) { obj->setProperty(name,se::Value(value)); }
bool create(se::State &s) {
  if (s.args().size()!=1 || !s.args()[0].isString()) return false;
  @autoreleasepool {
    NSError *error=nil;
    NSString *path=[NSString stringWithUTF8String:s.args()[0].toString().c_str()];
    AVAudioFile *file=[[AVAudioFile alloc] initForReading:[NSURL fileURLWithPath:path] commonFormat:AVAudioPCMFormatFloat32 interleaved:NO error:&error];
    if (!file) return false;
    const auto frames=file.length;
    if (frames<=0 || frames>64*1024*1024/sizeof(float)/2 || !file.processingFormat.channelCount) { [file release]; return false; }
    AVAudioPCMBuffer *buffer=[[AVAudioPCMBuffer alloc] initWithPCMFormat:file.processingFormat frameCapacity:static_cast<AVAudioFrameCount>(frames)];
    if (![file readIntoBuffer:buffer error:&error]) { [buffer release]; [file release]; return false; }
    auto t=std::make_shared<Track>(); t->frames=buffer.frameLength; t->sampleRate=file.processingFormat.sampleRate;
    t->pcm.resize(t->frames*2);
    for (size_t i=0;i<t->frames;++i) for (size_t ch=0;ch<2;++ch) t->pcm[i*2+ch]=buffer.floatChannelData[std::min(ch,static_cast<size_t>(file.processingFormat.channelCount)-1)][i];
    [buffer release]; [file release];
    std::lock_guard<std::mutex> lock(controls);
    size_t bytes=t->pcm.size()*sizeof(float);
    if (tracks.size()>=32 || decodedBytes+bytes>maxBytes) return false;
    decodedBytes+=bytes; int id=++serial; tracks[id]=t; s.rval().setInt32(id);
  }
  return true;
}
SE_BIND_FUNC(create)
bool project(se::State &s) {
  if (s.args().size()!=5 || !s.args()[4].isObject()) return false;
  uint8_t *bytes=nullptr; size_t length=0;
  if (!s.args()[4].toObject()->getArrayBufferData(&bytes,&length) || length%(sizeof(double)*5) || length>48*5*sizeof(double)) return false;
  size_t count=length/sizeof(double)/5;
  std::array<Filter,48> filters{};
  for (size_t i=0;i<count;++i) for (size_t j=0;j<5;++j) {
    double v; std::memcpy(&v,bytes+(i*5+j)*sizeof(double),sizeof(double));
    if (!std::isfinite(v)) return false; filters[i].c[j]=v;
  }
  double gain=s.args()[1].toDouble(), rate=s.args()[2].toDouble();
  if (!std::isfinite(gain) || gain<0 || !std::isfinite(rate) || rate<0.25 || rate>4) return false;
  std::lock_guard<std::mutex> lock(controls); auto t=find(s.args()); if (!t) return false;
  t->gain=gain; t->rate=rate; t->loop=s.args()[3].toBoolean();
  for (size_t i=0;i<count;++i) { if(i>=t->filterCount) t->filters[i]=Filter{}; t->filters[i].c=filters[i].c; }
  t->filterCount=count; s.rval().setBoolean(true); return true;
}
SE_BIND_FUNC(project)
bool control(se::State &s) {
  if (s.args().size()!=3) return false;
  int command=s.args()[1].toInt32();
  if (command==1 && !startEngine()) return false;
  std::lock_guard<std::mutex> lock(controls); auto t=find(s.args()); if (!t) return false;
  if (command==1) { if(t->ended) t->position=0; t->playing=true; t->ended=false; }
  else if (command==2) t->playing=false;
  else if (command==3 || command==4) {
    double ms=command==3?0:s.args()[2].toDouble();
    if (!std::isfinite(ms) || ms<0) return false;
    t->position=std::min(static_cast<double>(t->frames),ms*t->sampleRate/1000); t->ended=false;
    if(command==3) t->playing=false;
    for (auto &f:t->filters) { f.z1[0]=f.z1[1]=f.z2[0]=f.z2[1]=0; }
    t->outputCount=0;
  } else return false;
  s.rval().setBoolean(true); return true;
}
SE_BIND_FUNC(control)
bool inspect(se::State &s) {
  std::lock_guard<std::mutex> lock(controls); auto t=find(s.args()); if(!t) return false;
  se::HandleObject out(se::Object::createPlainObject());
  field(out,"positionMs",t->position/t->sampleRate*1000); field(out,"durationMs",t->frames/t->sampleRate*1000);
  field(out,"playing",t->playing); field(out,"ended",t->ended); field(out,"gain",t->gain); field(out,"playbackRate",t->rate); field(out,"sampleRate",outputRate);
  if(s.args().size()>1 && s.args()[1].toBoolean()) {
    std::array<float,4096> pcm{};
    for(size_t i=0;i<t->outputCount;++i) pcm[i]=t->output[(t->outputCursor+t->output.size()-t->outputCount+i)%t->output.size()];
    se::HandleObject data(se::Object::createArrayBufferObject(pcm.data(),t->outputCount*sizeof(float)));
    out->setProperty("pcm",se::Value(data));
  }
  s.rval().setObject(out); return true;
}
SE_BIND_FUNC(inspect)
bool dispose(se::State &s) {
  bool empty;
  { std::lock_guard<std::mutex> lock(controls); auto t=find(s.args()); if(!t) return false;
    decodedBytes-=t->pcm.size()*sizeof(float); tracks.erase(s.args()[0].toInt32()); empty=tracks.empty(); }
  if(empty) [engine stop]; s.rval().setBoolean(true); return true;
}
SE_BIND_FUNC(dispose)
}
bool registerQuaCreatorAudio(se::Object *global) {
  se::HandleObject bridge(se::Object::createPlainObject());
  bridge->defineFunction("create",_SE(create)); bridge->defineFunction("project",_SE(project)); bridge->defineFunction("control",_SE(control)); bridge->defineFunction("inspect",_SE(inspect)); bridge->defineFunction("dispose",_SE(dispose));
  global->setProperty("__quaCreatorAudio",se::Value(bridge));
  se::ScriptEngine::getInstance()->addBeforeCleanupHook([](){ [engine stop]; { std::lock_guard<std::mutex> lock(controls); tracks.clear(); decodedBytes=0; } [source release]; [engine release]; source=nil; engine=nil; });
  return true;
}
`
