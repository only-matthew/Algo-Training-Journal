#include<iostream>
#include<cstring>
#include<algorithm>
using namespace std;
const int MAXN = 1000 + 5;
struct Bigint{
    int len;
    int a[MAXN];
    void init(int x){
        memset(a, 0, sizeof(a));
        a[1] = x;
        len=1;
    }
    void flatten(int l){
        this->len = l;
        for (int i = 1; i <= len; i++){
            a[i + 1] += a[i] / 10;
            a[i] %= 10;
        }
        while(!a[len])len--;
    }
    void print(){
        for (int i = len; i >= 1; i--)
            cout << a[i];
    }
};
Bigint operator+(Bigint a, Bigint b){
    Bigint c; c.init(0);
    for(int i=1;i<=a.len+b.len;i++){
        c.a[i]+=a.a[i]+b.a[i];
    }
    c.flatten(a.len+b.len+5);
    return c;
}
Bigint f[MAXN];
int main(){
    int n, m; cin >> n >> m;
    int d = m - n + 1;
    f[1].init(1); f[2].init(1);
    for(int i = 3; i <= d; i++){
        f[i] = f[i - 1] + f[i - 2];
        // cout << i<<":"<<f[i].len << " ";
        // f[i].print();
        // cout << endl;
    }
    f[d].print();
    return 0;
}