#include<iostream>
#include<algorithm>
#include<numeric>
using namespace std;
const int MAXN = 3e5+5;
int a[MAXN], g[600];
bool is_prime(int x){
    for (int i = 2; i * i <= x; i++)
        if (x % i == 0) return false;
    return true;
}
int main(){
    int t; cin >> t;
    
    while(t--){
        int n, x; cin >> n >> x;
        for (int i = 1; i <= n; i++) cin >> a[i];
        int cnt = 0;long long ans = 0;
        int tmp = x;
        for (int p = 2; p * p <= tmp; p++) {
            if (tmp % p == 0) {
                g[++cnt] = p;
                while (tmp % p == 0)
                    tmp /= p;
            }
        }
        if (tmp > 1)
            g[++cnt] = tmp;
        for (int i = 1; i <= cnt; i++){
            long long ans_tmp = 0;
            for (int k = 1; k <= n; k++){
                if (a[k] % g[i] == 0) ans_tmp += a[k];
            }
            ans = max(ans, ans_tmp);
        }
        cout << ans << endl;
    }
    return 0;
}