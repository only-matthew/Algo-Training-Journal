#include<iostream>
#include<algorithm>
using namespace std;
struct Coin{
    int m, v;
};
bool cmp(Coin a, Coin b){
    return a.v * b.m > b.v * a.m;
}
Coin coin[105];
int main(){
    float ans = 0;
    int n, t; cin >> n >> t;
    int rm = t;
    for (int i = 1; i <= n; i++) cin >> coin[i].m >> coin[i].v;
    sort(coin + 1, coin + n + 1, cmp);
    int i;
    for (i = 1; i <= n; i++){
        if (coin[i].m > rm) break;
        ans += coin[i].v;
        rm -= coin[i].m;
    }
    if (i < n)
        ans +=  1.0 * rm * coin[i].v / coin[i].m;
    printf("%0.2lf", ans);
    return 0;
}