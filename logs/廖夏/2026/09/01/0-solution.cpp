#include<iostream>
#include<algorithm>
#include<string>
#include<cstring>
using namespace std;
const int MAXN = 1e3 + 5;
struct Per{
    int a; int b;
};
Per p[MAXN];
bool cmp(Per A, Per B){
    return A.a * A.b < B.a * B.b;
}
struct BigInt{
    int a[5000]; int len;
    void init(int x){
        memset(a, 0, sizeof(a));
        if (x == 0) {len = 1; return;}
        len = 1;
        for (;x; len++) a[len] = x % 10, x /= 10;
        len--;
    }
    void flatten(int l){
        len = l;
        for (int i = 1; i <= len; i++) a[i + 1] += a[i] / 10, a[i] %= 10;
        while (len>1&&!a[len]) len--; 
    }
    void print(){
        for (int i = len; i >= 1; i--) cout << a[i];
    }
};
BigInt operator*(BigInt A, int B){
    int b[10];
    memset(b, 0, sizeof(b)); int lenb = 1;
    for (;B; lenb++) b[lenb] = B % 10, B /= 10; 
    lenb--;
    BigInt c; c.init(0);
    for (int i = 1; i <= A.len; i++)
        for (int j = 1; j <= lenb; j++)
            c.a[i + j - 1] += A.a[i] * b[j];
    c.flatten(A.len + lenb);
    return c;
}
BigInt operator/(BigInt A, int B)
{
    BigInt c;
    c.init(0);
    int r = 0;
    for (int i = A.len; i >= 1; i--){
        r = r * 10 + A.a[i];
        c.a[i] = r / B;
        r %= B;
    }
    c.len = A.len;
    while (c.len > 1 && c.a[c.len] == 0)
        c.len--;
    return c;
}
bool operator<(BigInt A, BigInt B){
    if (A.len != B.len)
        return A.len < B.len;
    for (int i = A.len; i >= 1; i--){
        if (A.a[i] != B.a[i])
            return A.a[i] < B.a[i];
    }
    return false;
}
int main(){
    int n; cin >> n;
    int a_, b_; cin >> a_ >> b_;
    for (int i = 1; i <= n; i++)
        cin >> p[i].a >> p[i].b;
    sort(p + 1, p + 1 + n, cmp);
    BigInt sum;
    sum.init(a_);
    BigInt ans;
    ans.init(0);
    for (int i = 1; i <= n; i++){
        BigInt now = sum / p[i].b;
        if (ans < now)
            ans = now;
        sum = sum * p[i].a;
    }
    ans.print();
    return 0;
}