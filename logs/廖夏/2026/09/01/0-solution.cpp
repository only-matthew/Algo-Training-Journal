#include<iostream>
#include<cstring>
#include<algorithm>
using namespace std;
const int MAXN = 1e3 + 5;
struct BigInt{
    int a[5005], len; // 乘积最多约 4004 位, 留出余量
    int& operator[](int idx) { return a[idx]; }
    void init(int x){
        memset(a, 0, sizeof(a));
        len = 0;
        if (x == 0) {len = 1; return;}
        while(x) {a[++len] = x % 10; x /= 10;}
    }
    void flatten(int l){
        this->len = l;
        for (int i = 1; i <= len; i++) a[i + 1] += a[i] / 10, a[i] %= 10;
        while (len>1&&!a[len]) len--; 
    }
    void print(){
        for (int i = len; i >= 1; i--) cout << a[i];
    }
};
bool operator<(BigInt A, BigInt B){
    if (A.len != B.len) return A.len < B.len;
    for (int i = A.len; i >= 1; i--)
        if (A[i] != B[i]) return A[i] < B[i];
    return false; 
}
BigInt operator*(BigInt A, BigInt B){
    BigInt C; C.init(0);
    for (int i = 1; i <= A.len; i++)
        for (int j = 1; j <= B.len; j++)
            C[i + j - 1] += A[i] * B[j];
    C.flatten(A.len + B.len + 1);
    return C;
}
BigInt operator-(BigInt A, BigInt B){  // 前提 A >= B
    for (int i = 1; i <= A.len; i++) {
        A[i] -= (i <= B.len ? B[i] : 0); // 天才般的想法！
        if (A[i] < 0) { // 借位
            A[i] += 10;
            A[i + 1]--;
        }
    }
    while (A.len > 1 && !A[A.len]) A.len--;
    return A;
}
BigInt operator/(BigInt A, BigInt B){  // 高精度 ÷ 高精度, 向下取整
    BigInt C, R;
    C.init(0); // res
    R.init(0); // 余数
    for (int i = A.len; i >= 1; i--) {
        for (int j = R.len; j >= 1; j--) R[j + 1] = R[j]; // 新概念乘 10
        R.len++;
        R[1] = A[i];
        while (R.len > 1 && !R[R.len]) R.len--;
        int q = 0;
        while (!(R < B)) { R = R - B; q++; }
        C[i] = q;
    }
    C.len = A.len;
    while (C.len > 1 && !C[C.len]) C.len--;
    return C;
}
struct P{
    int a, b;
};
bool operator<(P A, P B){
    return (long long)A.a * A.b < (long long)B.a * B.b;
}
P p[MAXN];
int main(){
    int n; cin >> n; int a, b; cin >> a >> b;
    for (int i = 1; i <= n; i++) cin >> p[i].a >> p[i].b;
    sort(p + 1, p + 1 + n);
    BigInt sum, ans;
    sum.init(a);
    ans.init(0);
    for (int i = 1; i <= n; i++) {
        BigInt dv; dv.init(p[i].b);
        BigInt cur = sum / dv;      // 第 i 个大臣的奖赏
        if (ans < cur) ans = cur;
        BigInt tmp; tmp.init(p[i].a);
        sum = sum * tmp;
    }
    ans.print();
    return 0;
}