#include<iostream>
#include<algorithm>
using namespace std;
struct M{
    int a, b;
};
const int MAXN = 1e5 + 5;
M m[MAXN];
int n, p;

bool P(double t){
    double cost = 0;
    for (int i = 1; i <= n; i++)
        cost += max(0.0,m[i].a * t - m[i].b);
    return cost <= p * t;
}

int main(){
    cin >> n >> p;
    long long sumA = 0;
    for (int i = 1; i <= n; i++) {cin >> m[i].a >> m[i].b; sumA += m[i].a;}
    if (sumA <= p) {cout << -1; return 0;}
    double l = 0.0, r = 1e11 + 5.0, ans;
    int cnt = 0;
    while (cnt <= 1000){
        double mid = l + (r - l) / 2;
        if (P(mid)) l = mid,ans = mid;
        else r = mid;
        cnt++;
    }
    printf("%0.8lf",ans);
    return 0;
}