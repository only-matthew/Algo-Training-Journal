#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e5 + 5;
int a[MAXN];
int n, k, ans;
int P(int l){
    int sum = 0;
    for (int i = 1; i <= n; i++) 
        if (a[i] > l) sum += a[i] / l;
    return sum >= k;
}
int main(){
    ios::sync_with_stdio(0);
    cin.tie(0); cout.tie(0);
    cin >> n >> k;
    for (int i = 1; i <= n; i++) cin >> a[i];
    int l = 0; int r = 1e8 + 1;
    // int tmp = 0;
    while (l + 1< r){
        int mid = l + (r - l) / 2;
        if (P(mid))
            l = mid, ans = mid;
        else r = mid;
        // printf("%d : %d \n", l, r);
        // if (tmp > 30) break;
        // tmp++;
    }
    cout << ans;
    return 0;
}