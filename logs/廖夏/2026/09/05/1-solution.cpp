#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN =  1e6 + 5;
int n, m;
int a[MAXN];
bool P(int x){
    long long sum = 0;
    for (int i = 1; i <= n; i++) 
        if (a[i] > x) sum += a[i] - x;
    return sum >= m;
}
int main(){
    cin >> n >> m;
    for (int i = 1 ; i <= n; i++) cin >> a[i];
    int l = 1; int r = 4e5+5;
    int ans;
    while(l<=r){
        // cout << l << " " << r << endl;
        int mid = l + (r-l)/2;
        if (P(mid)) l = mid + 1, ans = mid;
        else r = mid - 1;
        // cout << l << " " << r << endl;
    }
    cout << ans;
    return 0;
}