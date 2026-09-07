#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e5 + 5;
int a[MAXN], b[MAXN];
int n, m;
long long ans;
int main(){
    cin >> m >> n;
    for (int i = 1; i <= m; i++) cin >> a[i];
    for (int i = 1; i <= n; i++) cin >> b[i];
    sort(a + 1, a + 1 + m);
    for (int i = 1; i <= n; i++){
        int l = 1, r = m + 1;
        int delta = 1e6;
        while (l < r){
            int mid = l + (r - l) / 2;
            if (a[mid] >= b[i]) r = mid;
            else l = mid + 1;
        }
        if (l == 1) delta = abs(a[1] - b[i]);
        else if (l == m + 1) delta = abs(a[m] - b[i]);
        else delta = min(abs(a[l] - b[i]), abs(a[l - 1] - b[i]));
        ans += delta;
    }
    cout << ans;
    return 0;
}