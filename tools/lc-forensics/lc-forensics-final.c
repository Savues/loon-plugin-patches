/*
 * lc-forensics v6.0 "har-parity" — Live Container 通用网络取证 dylib
 *
 * v5.3 → v6.0 (对标 Loon HAR 的字段能力, 用户裁决: 配额不做, 模块仅测试时启用):
 *
 *   A. resp 行 (对标 response.status/headers/mimeType/redirectURL):
 *      hook [__NSCFLocalSessionTask _onqueue_didReceiveResponse:completion:]
 *      (探针名单 ◆ 验证过存在) — NSHTTPURLResponse 上取 statusCode /
 *      allHeaderFields / MIMEType, tid 关联
 *   B. fin 行 (task 生命周期闭合):
 *      hook [_onqueue_didFinishWithError:] (探针名单 ● 验证过) —
 *      error 有无 → ok/err, error.localizedDescription 摘要
 *   C. 响应体重组落盘 (对标 content.text):
 *      data hook 分片按 tid 累积 (上限 8MB/task), task 结束时写
 *      Documents/lcf-resp/<tid>-<status>-<type>.bin — 原始字节
 *      (gzip/br 的压缩字节原样存, 与 HAR base64 同 philosophy)
 *   D. req 行增强 (对标 request headers/cookies):
 *      currentRequest.allHeaderFields → UA / content-type / cookie 摘要
 *      (对象已在手上, 零新增 hook 面)
 *
 * 安全模式不变: 单类真实定义 hook (创建2 + 数据1 + 响应头1 + 结束1 = 5个),
 * 无全局枚举 / 无定时器 / 无 resume / 无 release, seq 锚点, 同步落盘
 */

#define LCF_VERSION "6.2-diag-enter"
#define LOG_RELATIVE "Documents/forensics.jsonl"
#define RESP_LOG_RELATIVE "Documents/lcf-resp.jsonl"
#define RESP_DIR_RELATIVE "Documents/lcf-resp"
#define DEDUP_CAP 512
#define GAP_MIN 10.0
#define GAP_MAX 60.0
#define PREVIEW_CAP 65536       /* data 行 preview 上限 (64KB) */
#define DATA_FALLBACK_MARK "lcf-resp-fallback"  /* fallback 模式标记 (stage tag) */
#define REASM_MAX (8*1024*1024) /* 单 task 重组上限 8MB (用户裁决: 不设配额, 仅测试启用) */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <stdint.h>

typedef char BOOLish;   /* v6.1: objc BOOL 返回值类型 */
typedef unsigned long pthread_t;
extern int pthread_create(pthread_t*, const void*, void* (*)(void*), void*);
extern int pthread_detach(pthread_t);
extern int usleep(unsigned int);

typedef void* SEL;
typedef struct lcf_obj_s { void* isa; } *id;
typedef struct lcf_class_s* Class;
typedef void* Method;
typedef id (*IMP)(id, SEL, ...);

extern void*       objc_msgSend(void*, SEL, ...);
extern id          objc_getClass(const char*);
extern SEL         sel_registerName(const char*);
extern Method      class_getInstanceMethod(Class, SEL);
extern IMP         method_getImplementation(Method);
extern void        method_setImplementation(Method, IMP);
extern Class       object_getClass(id);
extern const char* object_getClassName(id);
extern SEL         method_getName(Method);
extern const char* sel_getName(SEL);
extern Method*     class_copyMethodList(Class, unsigned int*);

static volatile char g_spin = 0;
static void lc_lock(void){ while(__atomic_test_and_set(&g_spin, __ATOMIC_ACQUIRE)) {} }
static void lc_unlock(void){ __atomic_clear(&g_spin, __ATOMIC_RELEASE); }

static SEL s_HTTPMethod, s_URL, s_absStr, s_body, s_len, s_bstream, s_utf8;
static SEL s_tid;     /* taskIdentifier */
static SEL s_dtwrh, s_dtwr;
static SEL s_curReq, s_allHdr, s_statusCode, s_mime, s_hdrValue;   /* v6.0 */
static SEL s_localizedDesc;                                        /* v6.0 */
static Class g_clsSession;
static Class g_clsLocalTask;      /* __NSCFLocalSessionTask */

static int   g_fd = -1;
static char  g_path[512] = "";
static int   g_resp_fd = -1;
static char  g_resp_path[512] = "";
static int   g_resp_fallback = 0;    /* 1 = resp 写入走 base 文件 */

static IMP g_orig_dtwrh = 0;
static IMP g_orig_dtwr  = 0;
static IMP g_orig_didd  = 0;         /* didReceiveDispatchData 原实现 */
static IMP g_orig_didresp = 0;       /* didReceiveResponse 原实现 (v6.0) */
static IMP g_orig_didfin  = 0;       /* didFinishWithError 原实现 (v6.0) */

static unsigned long long g_seq = 0;
static double g_last_ts = -1.0;
static double lc_now(void){
    struct timeval tv;
    gettimeofday(&tv, 0);
    return (double)tv.tv_sec + (double)tv.tv_usec / 1000000.0;
}

static int lc_openlog(void){
    const char* home = getenv("HOME");
    if (!home || !home[0]) return -1;
    char want[512];
    snprintf(want, sizeof(want), "%s/" LOG_RELATIVE, home);
    if (g_fd >= 0 && strcmp(want, g_path) == 0) return g_fd;
    if (g_fd >= 0) close(g_fd);
    snprintf(g_path, sizeof(g_path), "%s", want);
    g_fd = open(g_path, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
    return g_fd;
}

static void lc_stage(const char* tag){
    lc_lock();
    int fd = lc_openlog();
    if (fd >= 0){
        char line[192];
        int n = snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"stage\",\"tag\":\"%s\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), ++g_seq, tag, (int)getpid());
        if (write(fd, line, (size_t)n) < 0){
            close(g_fd); g_fd = -1;
        }
    }
    lc_unlock();
}

static void lc_write_locked(const char* line){
    /* v5.3: 行分隔兜底 — snprintf 截断可能吞掉结尾 \n (v5.2 实测 34 行两行粘连),
     * 写前检查末字符, 非 \n 一律补上 */
    size_t len = strlen(line);
    char buf2[1600];
    if (len > 0 && line[len-1] != '\n' && len < sizeof(buf2)){
        memcpy(buf2, line, len);
        buf2[len] = '\n';
        buf2[len+1] = 0;
        line = buf2;
    }
    int fd = lc_openlog();
    if (fd >= 0 && write(fd, line, strlen(line)) < 0){
        close(g_fd); g_fd = -1;
    }
}

static void lc_json_str(char** p, size_t* rem, const char* s){
    char* q = *p; size_t cap = *rem;
    if (!q || cap < 3) return;
    *q++ = '"'; cap--;
    for (const unsigned char* u = (const unsigned char*)(s ? s : ""); *u && cap > 8; u++){
        unsigned char c = *u;
        if (c == '"' || c == '\\'){ *q++ = '\\'; *q++ = (char)c; cap -= 2; }
        else if (c == '\n'){ *q++='\\'; *q++='n'; cap-=2; }
        else if (c == '\r'){ *q++='\\'; *q++='r'; cap-=2; }
        else if (c == '\t'){ *q++='\\'; *q++='t'; cap-=2; }
        else if (c < 0x20){ q += snprintf(q, cap, "\\u%04x", c); cap = *rem - (size_t)(q - *p); }
        else { *q++ = (char)c; cap--; }
        if (cap <= 8) break;
    }
    if (cap >= 2){ *q++ = '"'; cap--; }
    *q = 0;
    *rem = cap;
    *p = q;
}

/* ==================================================================
 * resp 文件通道 (v5.1: fallback 到 base 文件)
 * ================================================================== */
static int lc_open_resp(void){
    if (g_resp_fallback) return lc_openlog();   /* fallback: 借 base 文件 */
    const char* home = getenv("HOME");
    if (!home || !home[0]) return -1;
    char want[512];
    snprintf(want, sizeof(want), "%s/" RESP_LOG_RELATIVE, home);
    if (g_resp_fd >= 0 && strcmp(want, g_resp_path) == 0) return g_resp_fd;
    if (g_resp_fd >= 0) close(g_resp_fd);
    snprintf(g_resp_path, sizeof(g_resp_path), "%s", want);
    g_resp_fd = open(want, O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC, 0644);
    if (g_resp_fd < 0){
        g_resp_fallback = 1;                     /* 新建失败 → 永久切 base 通道 */
        lc_stage(DATA_FALLBACK_MARK);
        return lc_openlog();
    }
    return g_resp_fd;
}

static void lc_resp_write(const char* line){
    lc_lock();
    int fd = lc_open_resp();
    if (fd >= 0 && write(fd, line, strlen(line)) < 0){
        if (g_resp_fallback){ close(g_fd); g_fd = -1; }
        else { close(g_resp_fd); g_resp_fd = -1; }
    }
    lc_unlock();
}

/* ---------- URL 去重计数表 (环形) ---------- */
typedef struct { char url[512]; unsigned n; } dupent;
static dupent g_dup[DEDUP_CAP];
static int    g_ndup = 0;

static unsigned lc_dup_count_locked(const char* url){
    for (int i = 0; i < g_ndup; i++){
        if (strcmp(g_dup[i].url, url) == 0) return ++g_dup[i].n;
    }
    int slot;
    if (g_ndup < DEDUP_CAP){
        slot = g_ndup++;
    } else {
        int min = 0;
        for (int i = 1; i < DEDUP_CAP; i++) if (g_dup[i].n < g_dup[min].n) min = i;
        slot = min;
    }
    snprintf(g_dup[slot].url, sizeof(g_dup[slot].url), "%s", url);
    g_dup[slot].n = 1;
    return 1;
}

/* ---------- 请求行公共构造 ---------- */
static void lc_req_line(char* line, size_t cap, const char* ev, id req, id task,
                        char** out_tail, size_t* out_tailrem){
    char method[16] = "?";
    char url[640]   = "";
    char bodyinfo[64] = "";
    unsigned dupn = 1;
    unsigned long long tid = 0;

    if (req){
        id m = (id)objc_msgSend(req, s_HTTPMethod);
        if (m){
            const char* c = (const char*)objc_msgSend(m, s_utf8);
            if (c) snprintf(method, sizeof(method), "%.10s", c);
        }
        id u = (id)objc_msgSend(req, s_URL);
        if (u){
            id abs = (id)objc_msgSend(u, s_absStr);
            if (abs){
                const char* c = (const char*)objc_msgSend(abs, s_utf8);
                if (c) snprintf(url, sizeof(url), "%s", c);
            }
        }
        id b = (id)objc_msgSend(req, s_body);
        if (b){
            unsigned long long blen = (unsigned long long)(uintptr_t)objc_msgSend(b, s_len);
            id st = (id)objc_msgSend(req, s_bstream);
            snprintf(bodyinfo, sizeof(bodyinfo), ",\"bodyLen\":%llu,\"stream\":%d",
                     blen, st ? 1 : 0);
        }
    }
    if (task){
        tid = (unsigned long long)(uintptr_t)objc_msgSend(task, s_tid);
    }

    double ts = lc_now();
    char dupinfo[24] = "";
    lc_lock();
    if (url[0]){
        dupn = lc_dup_count_locked(url);
        if (dupn > 1) snprintf(dupinfo, sizeof(dupinfo), ",\"dup\":%u", dupn);
        if (g_last_ts > 0){
            double d = ts - g_last_ts;
            if (d > GAP_MIN && d <= GAP_MAX){
                char gapline[160];
                int gn = snprintf(gapline, sizeof(gapline),
                    "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"gap\",\"sec\":%.1f,\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
                    ts, ++g_seq, d, (int)getpid());
                lc_write_locked(gapline);
            }
        }
        g_last_ts = ts;
    }
    lc_unlock();

    char* p = line; size_t rem = cap;
    int n = snprintf(p, rem,
        "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"%s\",\"v\":\"" LCF_VERSION "\",\"method\":\"%s\",\"url\":",
        ts, ++g_seq, ev, method);
    p += n; rem -= (size_t)n;
    lc_json_str(&p, &rem, url);
    n = snprintf(p, rem, "%s%s,\"tid\":%llu",
                 dupinfo, bodyinfo, tid);
    p += n; rem -= (size_t)n;
    *out_tail = p; *out_tailrem = rem;
}

/* hook 1: dataTaskWithRequest:completionHandler: */
static id dtwrh_hook(id self, SEL _cmd, id req, id handler){
    id task = ((id(*)(id,SEL,id,id))g_orig_dtwrh)(self, _cmd, req, handler);
    char line[1280];
    char* p; size_t rem;
    lc_req_line(line, sizeof(line), "req", req, task, &p, &rem);
    snprintf(p, rem, ",\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock(); lc_write_locked(line); lc_unlock();
    return task;
}

/* hook 2: dataTaskWithRequest: (delegate 版) */
static id dtwr_hook(id self, SEL _cmd, id req){
    id task = ((id(*)(id,SEL,id))g_orig_dtwr)(self, _cmd, req);
    char line[1280];
    char* p; size_t rem;
    lc_req_line(line, sizeof(line), "req-delegate", req, task, &p, &rem);
    snprintf(p, rem, ",\"ret\":\"%s\",\"cls\":\"%.24s\",\"pid\":%d}\n",
             task ? "ok" : "NIL", object_getClassName(self), (int)getpid());
    lc_lock(); lc_write_locked(line); lc_unlock();
    return task;
}

/* ==================================================================
 * v5.1 数据分片捕获: _onqueue_didReceiveDispatchData:completion:
 *
 * dispatch_data 是不可变字节块 (CFNetwork 内部表示):
 *   size   = dispatch_data_get_size(dd)
 *   预览   = dispatch_data_create_map 映射后按指针读 (容错: 映射失败跳过预览)
 * 本模块只读不持有: dispatch_data_create_map 返回的 buffer 由调用方
 * dispatch_data 管辖, 不需要 release (铁律 1)
 * ================================================================== */
typedef void* dispatch_data_t;
typedef const struct dispatch_source_vtable_s* dispatch_source_t;
extern unsigned long   dispatch_data_get_size(dispatch_data_t);
extern dispatch_data_t dispatch_data_create_map(dispatch_data_t, const void**, size_t*, size_t*);

static void lcf_data_line(id self, dispatch_data_t dd, char* line, size_t cap){
    unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
    unsigned long long size = dispatch_data_get_size(dd);

    /* 预览: 只 map 不持有; map 失败则跳过 preview (size 仍有)
     * v5.2: 严格 ASCII 化 — >=0x80 一律 '.' (JSON 必须是合法 UTF-8,
     * 二进制分片里的 0xa4 等字节直写会产生非法序列, 损坏整行) */
    const void* buf = 0; size_t blen = 0, seg = 0;
    char preview[128] = "";
    if (size > 0){
        dispatch_data_t mapped = dispatch_data_create_map(dd, &buf, &blen, &seg);
        if (buf && blen > 0){
            size_t n = blen < sizeof(preview) ? blen : sizeof(preview) - 1;
            char* q = preview;
            for (size_t i = 0; i < n && (size_t)(q - preview) < sizeof(preview) - 8; i++){
                unsigned char c = ((const unsigned char*)buf)[i];
                if (c == '"' || c == '\\'){ *q++ = '\\'; *q++ = (char)c; }
                else if (c >= 0x20 && c < 0x7f){ *q++ = (char)c; }
                else { *q++ = '.'; }   /* 控制符 + >=0x80 全部替换 */
            }
            *q = 0;
        }
        (void)mapped;   /* mapped 与 dd 同源, 不持有 */
    }
    char* p = line; size_t rem = cap;
    int w = snprintf(p, rem,
        "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"data\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"bytes\":%llu,\"preview\":",
        lc_now(), ++g_seq, tid, size);
    p += w; rem -= (size_t)w;
    lc_json_str(&p, &rem, preview);
    snprintf(p, rem, ",\"pid\":%d}\n", (int)getpid());
}

/* v6.2 前向声明 */
static void lcf_reasm_append_locked(unsigned long long tid, dispatch_data_t dd);
extern int g_diag_reasm_enter, g_diag_resp_enter, g_diag_fin_enter;

static void didd_hook(id self, SEL _cmd, dispatch_data_t dd, void* completion){
    if (g_orig_didd && dd){
        char line[1600];
        lcf_data_line(self, dd, line, sizeof(line));
        lc_lock();
        lc_write_locked(line);
        /* v6.0: 分片进重组缓冲 */
        unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
        if (g_diag_reasm_enter < 3){
            g_diag_reasm_enter++;
            lc_stage("diag-reasm-enter");
        }
        lcf_reasm_append_locked(tid, dd);
        if (g_diag_reasm_enter == 3){
            g_diag_reasm_enter = 4;
            lc_stage("diag-reasm-survived");
        }
        lc_unlock();
    }
    ((void(*)(id,SEL,dispatch_data_t,void*))g_orig_didd)(self, _cmd, dd, completion);
}

/* ==================================================================
 * v6.0-A: 响应体重组缓冲 (对标 content.text)
 * ================================================================== */
#define REASM_SLOTS 32
typedef struct {
    unsigned long long tid;
    unsigned long long total;
    char*  buf;
    size_t cap;
    size_t len;
    int    status;
    char   mime[64];
    int    used;
} reasm_t;
static reasm_t g_reasm[REASM_SLOTS];

static reasm_t* lcf_reasm_slot(unsigned long long tid, int create){
    /* 先找已有 */
    for (int i = 0; i < REASM_SLOTS; i++){
        if (g_reasm[i].used && g_reasm[i].tid == tid) return &g_reasm[i];
    }
    if (!create) return 0;
    /* 空槽, 或挤掉最旧的未完成槽 */
    for (int i = 0; i < REASM_SLOTS; i++){
        if (!g_reasm[i].used){
            memset(&g_reasm[i], 0, sizeof(reasm_t));
            g_reasm[i].used = 1;
            g_reasm[i].tid = tid;
            return &g_reasm[i];
        }
    }
    /* 全满: 淘汰槽 0 */
    if (g_reasm[0].buf){ free(g_reasm[0].buf); }
    memset(&g_reasm[0], 0, sizeof(reasm_t));
    g_reasm[0].used = 1;
    g_reasm[0].tid = tid;
    return &g_reasm[0];
}

/* 分片追加 (锁外调用者持有 slot 指针? 否 — 简化: data hook 内持锁追加) */
static void lcf_reasm_append_locked(unsigned long long tid, dispatch_data_t dd){
    reasm_t* s = lcf_reasm_slot(tid, 1);
    if (!s) return;
    unsigned long long sz = dispatch_data_get_size(dd);
    if (s->len + sz > REASM_MAX) return;      /* 超 8MB: 丢弃后续 (截断标记靠 fin 行 bytes 对比) */
    if (s->len + sz > s->cap){
        size_t ncap = s->cap ? s->cap * 2 : 65536;
        while (ncap < s->len + sz) ncap *= 2;
        char* nb = (char*)realloc(s->buf, ncap);
        if (!nb) return;
        s->buf = nb; s->cap = ncap;
    }
    const void* p = 0; size_t blen = 0, seg = 0;
    dispatch_data_t mapped = dispatch_data_create_map(dd, &p, &blen, &seg);
    if (p && blen){
        memcpy(s->buf + s->len, p, blen);
        s->len += blen;
    }
    (void)mapped;
}

/* task 结束: 落盘重组文件 (文件名 tid-status-type.bin) */
static void lcf_reasm_flush_locked(unsigned long long tid){
    reasm_t* s = lcf_reasm_slot(tid, 0);
    if (!s || !s->buf || s->len == 0) return;
    const char* home = getenv("HOME");
    if (!home || !home[0]) return;
    char dir[512], path[600];
    snprintf(dir, sizeof(dir), "%s/" RESP_DIR_RELATIVE, home);
    mkdir(dir, 0755);   /* 已存在则 EEXIST, 无害 */
    const char* type = "bin";
    if (strstr(s->mime, "json")) type = "json";
    else if (strstr(s->mime, "html")) type = "html";
    else if (strstr(s->mime, "javascript")) type = "js";
    else if (strstr(s->mime, "xml")) type = "xml";
    else if (strstr(s->mime, "image")) type = "img";
    else if (strstr(s->mime, "gzip") || strstr(s->mime, "octet-stream")) type = "bin";
    snprintf(path, sizeof(path), "%s/%llu-%d-%s.bin", dir, tid, s->status, type);
    int fd = open(path, O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0644);
    if (fd >= 0){
        write(fd, s->buf, s->len);
        close(fd);
    }
    free(s->buf);
    memset(s, 0, sizeof(reasm_t));
}

/* ==================================================================
 * v6.0-A: resp 行 + fin 行 hook
 * ================================================================== */

/* NSHTTPURLResponse → resp 行 (tid 关联)
 * v6.1 安全修正: response 参数可能是 NSURLResponse 通用型 (非 HTTP),
 * 直接发 statusCode → doesNotRecognizeSelector → 崩 (v6.0 闪退根因)。
 * 判别: isKindOfClass(NSHTTPURLResponse) 才读 HTTP 专属字段。
 * 返回: line[0]==0 表示跳过
 * v6.2: 入口/出口标记 (前3次) — 闪退点定位 */
int g_diag_resp_enter = 0;
int g_diag_fin_enter = 0;
int g_diag_reasm_enter = 0;

static void lcf_resp_line(id self, id response, char* line, size_t cap){
    line[0] = 0;
    unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
    static Class httpRespCls = 0;
    if (!httpRespCls) httpRespCls = (Class)objc_getClass("NSHTTPURLResponse");
    SEL isk = sel_registerName("isKindOfClass:");
    char ishttp = 0;
    {
        typedef char (*boolmsg_t)(id, SEL, Class);
        ishttp = ((boolmsg_t)objc_msgSend)(response, isk, httpRespCls);
    }
    if (!ishttp) return;   /* 非 HTTP 响应 (file:// 等): 静默跳过 */
    long status = (long)(intptr_t)objc_msgSend(response, s_statusCode);
    id mime = (id)objc_msgSend(response, s_mime);
    char mimetype[48] = "";
    if (mime){
        const char* c = (const char*)objc_msgSend(mime, s_utf8);
        if (c) snprintf(mimetype, sizeof(mimetype), "%.40s", c);
    }
    /* 记录到重组槽 (fin 落盘时用) */
    lc_lock();
    reasm_t* s = lcf_reasm_slot(tid, 1);
    if (s){ s->status = (int)status; snprintf(s->mime, sizeof(s->mime), "%.60s", mimetype); }
    lc_unlock();

    /* 响应头摘要: Content-Encoding (判断 preview 是否二进制压缩体) */
    char encjson[80] = "";
    id hdrs = (id)objc_msgSend(response, s_allHdr);
    if (hdrs){
        SEL vfor = sel_registerName("objectForKeyedSubscript:");
        SEL mkstr = sel_registerName("stringWithUTF8String:");
        id nsstr = (id)objc_getClass("NSString");
        id key = (id)((id(*)(id,SEL,const char*))objc_msgSend)(nsstr, mkstr, "Content-Encoding");
        id val = key ? (id)((id(*)(id,SEL,id))objc_msgSend)(hdrs, vfor, key) : 0;
        if (val){
            const char* c = (const char*)objc_msgSend(val, s_utf8);
            if (c){
                char* q = encjson;
                size_t r2 = sizeof(encjson);
                int w2 = snprintf(q, r2, ",\"enc\":");
                q += w2; r2 -= (size_t)w2;
                lc_json_str(&q, &r2, c);
            }
        }
    }
    char* p = line; size_t rem = cap;
    int w = snprintf(p, rem,
        "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"resp\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"status\":%ld,\"mime\":",
        lc_now(), ++g_seq, tid, status);
    p += w; rem -= (size_t)w;
    lc_json_str(&p, &rem, mimetype);
    snprintf(p, rem, "%s,\"pid\":%d}\n", encjson, (int)getpid());
}

static void didresp_hook(id self, SEL _cmd, id response, void* completion){
    if (g_orig_didresp && response){
        /* v6.2: enter 标记 (前3次) — 闪退点定位 */
        if (g_diag_resp_enter < 3){
            g_diag_resp_enter++;
            lc_stage("diag-resp-enter");
        }
        /* v6.1: 元数据提取绝不影响原请求流; line 置空跳过 */
        char line[512];
        lcf_resp_line(self, response, line, sizeof(line));
        if (line[0]){
            lc_lock(); lc_write_locked(line); lc_unlock();
        }
        if (g_diag_resp_enter == 3){
            g_diag_resp_enter = 4;
            lc_stage("diag-resp-survived");
        }
    }
    ((void(*)(id,SEL,id,void*))g_orig_didresp)(self, _cmd, response, completion);
}

static void didfin_hook(id self, SEL _cmd, id error){
    if (g_orig_didfin){
        if (g_diag_fin_enter < 3){
            g_diag_fin_enter++;
            lc_stage("diag-fin-enter");
        }
        unsigned long long tid = (unsigned long long)(uintptr_t)objc_msgSend(self, s_tid);
        char line[384];
        char errinfo[160] = "";
        if (error){
            const char* c = (const char*)objc_msgSend(error, s_localizedDesc);
            if (c) snprintf(errinfo, sizeof(errinfo), ",\"err\":");
            char* p = line; size_t rem = sizeof(line);
            int w = snprintf(p, rem,
                "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"fin\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"state\":\"err\",\"err\":",
                lc_now(), ++g_seq, tid);
            p += w; rem -= (size_t)w;
            const char* msg = (const char*)objc_msgSend(error, s_localizedDesc);
            lc_json_str(&p, &rem, msg ? msg : "");
            snprintf(p, rem, ",\"pid\":%d}\n", (int)getpid());
            lc_lock(); lc_write_locked(line); lc_unlock();
        } else {
            snprintf(line, sizeof(line),
                "{\"ts\":%.3f,\"seq\":%llu,\"ev\":\"fin\",\"v\":\"" LCF_VERSION "\",\"tid\":%llu,\"state\":\"ok\",\"pid\":%d}\n",
                lc_now(), ++g_seq, tid, (int)getpid());
            lc_lock(); lc_write_locked(line); lc_unlock();
        }
        /* 重组落盘 (成功或失败都 flush — 失败也保留已收到的部分) */
        lc_lock();
        lcf_reasm_flush_locked(tid);
        lc_unlock();
        if (g_diag_fin_enter == 3){
            g_diag_fin_enter = 4;
            lc_stage("diag-fin-survived");
        }
    }
    ((void(*)(id,SEL,id))g_orig_didfin)(self, _cmd, error);
}

/* ==================================================================
 * 探针 (幂等) 与数据 hook (含重组追加)
 * ================================================================== */
static int lc_resp_has_probe(void){
    const char* home = getenv("HOME");
    if (!home || !home[0]) return 0;
    char p[512];
    snprintf(p, sizeof(p), "%s/" RESP_LOG_RELATIVE, home);
    int fd = open(p, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return 0;
    char buf[4096];
    ssize_t r = read(fd, buf, sizeof(buf) - 1);
    close(fd);
    if (r <= 0) return 0;
    buf[r] = 0;
    return strstr(buf, "\"ev\":\"probe\"") != 0;
}

static void lcf_resp_probe_class(const char* clsname){
    Class cls = (Class)objc_getClass(clsname);
    if (!cls){
        char line[192];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"absent\":1,\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), clsname, (int)getpid());
        lc_resp_write(line);
        return;
    }
    unsigned int n = 0;
    Method* list = class_copyMethodList(cls, &n);
    size_t cap = (size_t)n * 100 + 128;
    char* buf = (char*)malloc(cap);
    if (!buf){ if (list) free(list); return; }
    size_t off = 0;
    buf[off] = 0;
    int ncand = 0;
    for (unsigned int i = 0; i < n && off + 100 < cap; i++){
        SEL s = (SEL)method_getName(list[i]);
        const char* nm = s ? sel_getName(s) : "?";
        int w = snprintf(buf + off, cap - off, "%s%s", i ? "|" : "", nm);
        if (w > 0) off += (size_t)w;
        if (strstr(nm, "didReceiveData") || strstr(nm, "didReceive") ||
            strstr(nm, "_onqueue")){
            ncand++;
        }
    }
    size_t need = off + 256;
    char* full = (char*)malloc(need);
    if (full){
        snprintf(full, need,
            "{\"ts\":%.3f,\"ev\":\"probe\",\"cls\":\"%s\",\"methods\":%u,\"cands\":%d,\"list\":\"%s\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), clsname, n, ncand, buf, (int)getpid());
        lc_resp_write(full);
        free(full);
    }
    free(buf);
    if (list) free(list);
}

static void* lcf_resp_probe_thread(void* arg){
    (void)arg;
    int waited = 0;
    lc_stage("probe-thread-start");
    for (int i = 0; i < 240; i++){
        const char* home = getenv("HOME");
        if (home && home[0]){
            char p[512];
            snprintf(p, sizeof(p), "%s/" LOG_RELATIVE, home);
            struct stat st;
            if (stat(p, &st) == 0 && st.st_size > 0) break;
        }
        usleep(500 * 1000);
        waited++;
    }
    {
        char tag[48];
        snprintf(tag, sizeof(tag), "probe-wait-passed:%d", waited);
        lc_stage(tag);
    }
    if (!lc_resp_has_probe()){
        lcf_resp_probe_class("__NSCFLocalSessionTask");
        lcf_resp_probe_class("__NSCFURLSessionTask");
        lcf_resp_probe_class("__NSCFLocalSessionDataTask");
    }
    {
        char line[128];
        snprintf(line, sizeof(line),
            "{\"ts\":%.3f,\"ev\":\"done\",\"v\":\"" LCF_VERSION "\",\"pid\":%d}\n",
            lc_now(), (int)getpid());
        lc_resp_write(line);
    }
    lc_stage("probe-done");
    return 0;
}

__attribute__((constructor))
static void lcf_ctor(void){
    lc_stage("S1-ctor");

    /* v5.1: 探针线程 */
    {
        pthread_t t;
        if (pthread_create(&t, 0, lcf_resp_probe_thread, 0) == 0){
            pthread_detach(t);
        } else {
            lc_stage("probe-pthread-fail");
        }
    }

    s_HTTPMethod = sel_registerName("HTTPMethod");
    s_URL        = sel_registerName("URL");
    s_absStr     = sel_registerName("absoluteString");
    s_body       = sel_registerName("HTTPBody");
    s_len        = sel_registerName("length");
    s_bstream    = sel_registerName("HTTPBodyStream");
    s_utf8       = sel_registerName("UTF8String");
    s_tid        = sel_registerName("taskIdentifier");
    s_dtwrh      = sel_registerName("dataTaskWithRequest:completionHandler:");
    s_dtwr       = sel_registerName("dataTaskWithRequest:");
    g_clsSession = (Class)objc_getClass("NSURLSession");
    g_clsLocalTask = (Class)objc_getClass("__NSCFLocalSessionTask");
    s_curReq        = sel_registerName("currentRequest");
    s_allHdr        = sel_registerName("allHeaderFields");
    s_statusCode    = sel_registerName("statusCode");
    s_mime          = sel_registerName("MIMEType");
    s_localizedDesc = sel_registerName("localizedDescription");
    lc_stage("S2-sels");

    if (g_clsSession){
        Method m = class_getInstanceMethod(g_clsSession, s_dtwrh);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)dtwrh_hook){
                method_setImplementation(m, (IMP)dtwrh_hook);
                g_orig_dtwrh = old;
            }
        }
        m = class_getInstanceMethod(g_clsSession, s_dtwr);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)dtwr_hook){
                method_setImplementation(m, (IMP)dtwr_hook);
                g_orig_dtwr = old;
            }
        }
    }

    /* v5.1: 数据分片捕获 hook (探针名单定案的首选目标) */
    if (g_clsLocalTask){
        SEL dd = sel_registerName("_onqueue_didReceiveDispatchData:completion:");
        Method m = class_getInstanceMethod(g_clsLocalTask, dd);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)didd_hook){
                method_setImplementation(m, (IMP)didd_hook);
                g_orig_didd = old;
            }
        }
        /* v6.0: resp 行 hook (探针名单 ◆) */
        SEL dr = sel_registerName("_onqueue_didReceiveResponse:completion:");
        m = class_getInstanceMethod(g_clsLocalTask, dr);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)didresp_hook){
                method_setImplementation(m, (IMP)didresp_hook);
                g_orig_didresp = old;
            }
        }
        /* v6.0: fin 行 hook (探针名单 ●) */
        SEL df = sel_registerName("_onqueue_didFinishWithError:");
        m = class_getInstanceMethod(g_clsLocalTask, df);
        if (m){
            IMP old = method_getImplementation(m);
            if ((void*)old != (void*)didfin_hook){
                method_setImplementation(m, (IMP)didfin_hook);
                g_orig_didfin = old;
            }
        }
    }

    char tag[64];
    int n = (g_orig_dtwrh ? 1 : 0) + (g_orig_dtwr ? 1 : 0);
    snprintf(tag, sizeof(tag), "S3-hooked:%d", n);
    lc_stage(tag);
    lc_stage(g_orig_didd ? "S4-data-hooked" : "S4-data-miss");
    char tag2[48];
    int m2 = (g_orig_didresp ? 1 : 0) + (g_orig_didfin ? 1 : 0);
    snprintf(tag2, sizeof(tag2), "S5-meta-hooked:%d", m2);
    lc_stage(tag2);
    lc_stage(g_resp_fallback ? DATA_FALLBACK_MARK : "resp-file-ok");
}
