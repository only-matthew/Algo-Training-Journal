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
BigInt operator/(BigInt A, long long b){  // 高精度 ÷ 小整数, 结果向下取整
    BigInt C; C.init(0);
    long long r = 0;
    for (int i = A.len; i >= 1; i--) {
        r = r * 10 + A[i];
        C[i] = r / b;
        r %= b;
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
        BigInt cur = sum / p[i].b;      // 第 i 个大臣的奖赏
        if (ans < cur) ans = cur;
        BigInt tmp; tmp.init(p[i].a);
        sum = sum * tmp;
    }
    ans.print();
    return 0;
}