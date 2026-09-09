#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e5 + 5;
int a[MAXN];
int n, m;
bool P(long long x){
    long long cnt = 1, sum = a[1];
    for (int i = 2; i <= n; i++){
        if (a[i] > x) return false; // Agent修正行
        if (sum + a[i] > x) sum = a[i], cnt++;
        else sum += a[i];
    }
    return cnt <= m;
}
int main(){
    cin >> n >> m;
    for (int i = 1; i <= n; i++) cin >> a[i];
    long long l = 0, r = 1e9 + 1, ans;
    while(l + 1 < r){
        long long mid = l + (r - l) / 2;
        if (P(mid)) r = mid, ans = mid;
        else l = mid;
        // cout << l << " " << r << endl;
    }
    cout << ans;
    return 0;
}