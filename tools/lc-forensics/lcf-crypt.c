/*
 * lcf-crypt — 拦截 CommonCrypto CCCrypt，落盘 key / iv / 密文 / 明文
 *
 * 用途: 逆向 App 内部的对称加密（如 B 站 memex 配置的 AES-ECB 值）
 * 机制: dyld __interpose 段替换 CCCrypt 实现，原函数经 dlsym(RTLD_NEXT) 取得
 * 输出: $HOME/Documents/lcf-crypt/crypt-<pid>.jsonl（每行一个调用）
 *
 * 过滤: 只记录 op==1(kCCDecrypt) 且 keyLength ∈ {16,24,32} 且 输入 <= 8KB
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdint.h>
#include <time.h>
#include <dlfcn.h>
#include <sys/stat.h>

#define LOG_DIR  "Documents/lcf-crypt"

typedef int32_t  CCCryptorStatus;
typedef uint32_t CCOperation;
typedef uint32_t CCAlgorithm;
typedef uint32_t CCOptions;

typedef CCCryptorStatus (*CCCrypt_t)(CCOperation, CCAlgorithm, CCOptions,
                                     const void *, size_t, const void *,
                                     const void *, size_t,
                                     void *, size_t, size_t *);

extern CCCryptorStatus CCCrypt(CCOperation, CCAlgorithm, CCOptions,
                               const void *, size_t, const void *,
                               const void *, size_t,
                               void *, size_t, size_t *);

static CCCrypt_t g_real;
static int       g_fd = -1;
static char      g_path[512];

static void hexify(char *out, const void *p, size_t n, size_t max)
{
    const unsigned char *b = (const unsigned char *)p;
    size_t i, o = 0;
    if (!p) { out[0] = 0; return; }
    for (i = 0; i < n && i < max && o < 1800; i++)
        o += (size_t)sprintf(out + o, "%02x", b[i]);
    out[o] = 0;
}

static void ensure_log(void)
{
    const char *home = getenv("HOME");
    char dir[512];
    if (g_fd >= 0 || !home || !*home) return;
    snprintf(dir, sizeof(dir), "%s/" LOG_DIR, home);
    mkdir(dir, 0755);
    snprintf(g_path, sizeof(g_path), "%s/crypt-%d.jsonl", dir, (int)getpid());
    g_fd = open(g_path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
}

static void emit(const char *s)
{
    ensure_log();
    if (g_fd < 0) return;
    write(g_fd, s, strlen(s));
    write(g_fd, "\n", 1);
}

static CCCryptorStatus my_CCCrypt(CCOperation op, CCAlgorithm alg, CCOptions options,
                                  const void *key, size_t keyLength, const void *iv,
                                  const void *dataIn, size_t dataInLength,
                                  void *dataOut, size_t dataOutAvailable,
                                  size_t *dataOutMoved)
{
    CCCryptorStatus r;
    if (!g_real) return -1;
    r = g_real(op, alg, options, key, keyLength, iv,
               dataIn, dataInLength, dataOut, dataOutAvailable, dataOutMoved);

    /* 只关心解密 + 常见 AES 密钥长度 + 合理输入 */
    if (op == 1 && (keyLength == 16 || keyLength == 24 || keyLength == 32) &&
        dataInLength > 0 && dataInLength <= 8192) {
        char kb[200], ib[80], db[1900], ob[1900];
        size_t outLen = (dataOutMoved && *dataOutMoved <= 8192) ? *dataOutMoved : 0;
        hexify(kb, key, keyLength, 64);
        hexify(ib, iv, 16, 16);
        hexify(db, dataIn, dataInLength, 900);
        hexify(ob, outLen ? dataOut : NULL, outLen, 900);

        char line[4600];
        snprintf(line, sizeof(line),
                 "{\"t\":%ld,\"alg\":%u,\"opt\":%u,\"kl\":%zu,\"r\":%d,"
                 "\"key\":\"%s\",\"iv\":\"%s\",\"in\":\"%s\",\"out\":\"%s\"}",
                 (long)time(0), alg, options, keyLength, (int)r,
                 kb, ib, db, ob);
        emit(line);
    }
    return r;
}

__attribute__((constructor)) static void lcf_init(void)
{
    g_real = (CCCrypt_t)dlsym(RTLD_NEXT, "CCCrypt");
    emit("{\"stage\":\"init\",\"real\":\"ok\"}");
}

__attribute__((used))
static struct {
    const void *replacement;
    const void *replacee;
} _interpose_CCCrypt __attribute__((section("__DATA,__interpose"))) = {
    (const void *)my_CCCrypt,
    (const void *)CCCrypt
};
