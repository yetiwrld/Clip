#include <stdio.h>
#include <string.h>

/* generate the expected table from a chosen key, then check it */
static void scramble(const unsigned char *in, unsigned char *out, int n) {
    for (int i = 0; i < n; i++)
        out[i] = (unsigned char)((in[i] ^ 0x5A) + (i * 7) % 11);
}

static const unsigned char T1[5] = {0x35,0x18,0x0d,0x19,0x3e}, T2[6] = {0x22,0x28,0x1a,0x35,0x12,0x34};   /* filled below */

int validate_key(const char *key) {
    unsigned char buf[16];
    if (strlen(key) != 12) return 0;
    scramble((const unsigned char *)key, buf, 12);
    if (memcmp(buf,     T1, 5) != 0) return 0;
    if (memcmp(buf + 6, T2, 6) != 0) return 0;
    return 1;
}

int main(int argc, char **argv) {
    if (argc < 2) { printf("usage: %s <key>\n", argv[0]); return 2; }
    printf(validate_key(argv[1]) ? "ACCEPTED\n" : "REJECTED\n");
    return 0;
}
