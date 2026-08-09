#include<iostream>
#include<cstring>
#include<algorithm>
using namespace std;
const int MAXN = 5e3 + 5;

struct Bigint{
    int a[5005], len;
    void init(int x){
        memset(a, 0, sizeof(a));
        a[1] = x;
        len = 1;
    }
    void flatten(int l){
        for (int i = 1; i <= l; i++){
            a[i + 1] += a[i] / 10;
            a[i] %= 10;
        }
        while (l > 0 && !a[l]) l--;
        len = l;
    }
    void print(){
        for (int i = len; i >= 1; i--)
            cout << a[i];
    }
};

Bigint operator+(Bigint a, Bigint b){
    Bigint c;
    c.len = a.len + b.len;
    for (int i = 1; i <= c.len; i++){
        c.a[i] = a.a[i] + b.a[i];
    }
    c.flatten(c.len + 5);
    return c;
}

int main(){
    ios::sync_with_stdio(false);
    cin.tie(0); cout.tie(0);
    int N;
    cin >> N;
    Bigint f[MAXN];
    f[1].init(1); f[2].init(2);
    for (int i = 3; i <= N; i++){
        f[i] = f[i - 1] + f[i - 2];
    }
    f[N].print();
    return 0;
}