#include<iostream>
#include<algorithm>
const int MAXN = 1e5 + 5;
int a[MAXN], n, l, k;
using namespace std;

int P(int x){
    int cnt = 0, last = 0;
    int i = 2;
    while (i <= n){
        if (cnt > k) return false;
        if (a[i] - last > x) cnt++, last += x;
        else last = a[i], i++;
    }
    return cnt <= k;
}

int main(){
    cin >> l >> n >> k;
    for (int i = 1; i <= n; i++) cin >> a[i];
    int l = 0, r = 1e9, ans;
    while (l + 1 < r){
        int mid = l + (r - l) / 2;
        if (P(mid)) r = mid, ans = mid;
        else l = mid;
    }
    cout << ans;
    return 0;
}