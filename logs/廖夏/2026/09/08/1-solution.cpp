#include<iostream>
#include<algorithm>
using namespace std;
int n, l, m;
const int MAXN = 5e4 + 5;
int a[MAXN];
bool P(int x){
    int cnt = 0, last = 0;
    for (int i = 1; i <= n + 1; i++){
        if (a[i] - a[last] < x) cnt++;
        else last = i;
    }
    return cnt <= m;
}
int main(){
    cin >> l >> n >> m; a[n+1] = l;
    for (int i = 1; i <= n; i++) cin >> a[i];
    int l = 0, r = 1e9, ans = 0;
    while (l + 1 < r){
        int mid = l + (r - l) / 2;
        if (P(mid)) l = mid, ans = mid;
        else r = mid;
        // cout << l << " " << r << endl;
    }
    cout << ans;
    return 0;
}