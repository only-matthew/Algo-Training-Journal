#include<iostream>
#include<algorithm>
using namespace std;
typedef long long ll;
int main(){
    ios::sync_with_stdio(0);
    cin.tie(0); cout.tie(0);
    ll t, x, y, k;
    cin >> t;
    while(t--){
        cin >> x >> y >> k;
        ll d = y - x;
        ll cnt = 0, ans = 0;
        if (d >= x){
            cnt = min(k, d-x+1);
            for (int i = 0; i < cnt; i++) ans += d % (x+i);
        }
        if (k > cnt) ans += (k-cnt) * d;
        cout << ans << "\n";
    }
}