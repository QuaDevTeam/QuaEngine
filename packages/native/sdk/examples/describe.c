#include <stdio.h>
#include <stdlib.h>
#include "qua_native.h"
int main(void) {
    size_t count=qua_native_describe(NULL,0);
    unsigned char *bytes=malloc(count);
    if(!bytes) return 1;
    qua_native_describe(bytes,count);
    fwrite(bytes,1,count,stdout);putchar('\n');free(bytes);
    return 0;
}
