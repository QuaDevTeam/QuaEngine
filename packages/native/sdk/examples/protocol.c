/* A headless, independently linked consumer for protocol/storage CI.
 * This does not qualify Metal presentation; use macos-parent.m for that. */
#include "qua_native.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <pthread.h>
static void check(int status) {
    if(!status)return;
    size_t size=qua_native_last_error(NULL,0);char *error=malloc(size+1);
    qua_native_last_error((void*)error,size);error[size]=0;
    fprintf(stderr,"Native SDK error: %s\n",error);free(error);exit(1);
}
static void *wrong_thread(void *pointer) {
    uint64_t handle=*(uint64_t*)pointer;
    if(qua_native_tick(handle)!=-1)exit(1);
    return NULL;
}
int main(int argc,char **argv) {
    if(argc!=6&&argc!=7)return 2;
    if(qua_native_abi_version()!=1||qua_native_tick(UINT64_MAX)!=-1)return 1;
    char *config=malloc(strlen(argv[1])+strlen(argv[2])+strlen(argv[3])+200);
    /* Test paths are tool-created and contain no quotes/backslashes. Product
     * callers must use their language's JSON serializer, as the Cocoa sample does. */
    sprintf(config,"{\"moduleDirectory\":\"%s\",\"moduleManifestSha256\":\"%s\",\"storageDirectory\":\"%s\"}",argv[1],argv[2],argv[3]);
    uint64_t handle=0;check(qua_native_create((void*)config,strlen(config),&handle));
    pthread_t thread;pthread_create(&thread,NULL,wrong_thread,&handle);pthread_join(thread,NULL);
    if(qua_native_open(handle,NULL,0)!=-1)return 1;
    const char *account=argc==7?argv[6]:"example-account";
    char *request=malloc(strlen(argv[4])+strlen(account)+250);
    sprintf(request,"{\"protocol\":\"qua-embedded\",\"version\":1,\"type\":\"open\",\"sessionId\":\"native-test\",\"storageNamespace\":\"%s\",\"parameters\":%s}",account,argv[4]);
    check(qua_native_open(handle,(void*)request,strlen(request)));
    if(qua_native_open(handle,(void*)request,strlen(request))!=-1||qua_native_destroy(handle)!=-1)return 1;
    uint64_t overlap=0;check(qua_native_create((void*)config,strlen(config),&overlap));
    if(qua_native_open(overlap,(void*)request,strlen(request))!=-1)return 1;
    check(qua_native_abort(overlap));
    uint64_t unopened=0;check(qua_native_create((void*)config,strlen(config),&unopened));
    check(qua_native_close(unopened));
    if(qua_native_open(unopened,(void*)request,strlen(request))!=-1)return 1;
    check(qua_native_destroy(unopened));
    unsigned ticks=0;int closed=0,cancelled=0;
    while(!closed&&ticks++<1000){
        if(ticks==1&&!strcmp(argv[5],"close-before-ready"))check(qua_native_close(handle));
        if(ticks>2&&ticks%10==0&&!strcmp(argv[5],"advance")){
            const char *input="{\"type\":\"advance\"}";check(qua_native_input(handle,(void*)input,strlen(input)));
        }
        check(qua_native_tick(handle));
        size_t size;
        while((size=qua_native_poll(handle,NULL,0))){
            unsigned char small=0x55;qua_native_poll(handle,&small,0);
            if(small!=0x55||qua_native_poll(handle,NULL,0)!=size)return 1;
            char *event=malloc(size+1);qua_native_poll(handle,(void*)event,size);event[size]=0;puts(event);
            if(strstr(event,"\"type\":\"ready\"")&&!strcmp(argv[5],"cancel")&&!cancelled){
                const char *cancel="{\"protocol\":\"qua-embedded\",\"version\":1,\"type\":\"cancel\",\"sessionId\":\"native-test\"}";
                check(qua_native_cancel(handle,(void*)cancel,strlen(cancel)));cancelled=1;
            }
            if(strstr(event,"\"type\":\"closed\""))closed=1;
            free(event);
        }
        struct timespec delay={0,1000000};nanosleep(&delay,NULL);
    }
    if(!closed){qua_native_abort(handle);fprintf(stderr,"protocol timeout\n");return 1;}
    check(qua_native_destroy(handle));
    if(qua_native_destroy(handle)!=-1||qua_native_tick(handle)!=-1)return 1;
    printf("QUA_NATIVE_PARENT_OK ticks=%u\n",ticks);free(request);free(config);return 0;
}
