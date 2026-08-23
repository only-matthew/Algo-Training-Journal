#include <bits/stdc++.h>
using namespace std;
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    int T;
    cin >> T;
    while (T--) {
        int n, m, k;
        cin >> n >> m >> k;
        vector<double> p(k + 1);
        p[0] = pow(0.5, k);
        for (int j = 1; j <= k; ++j) {
            p[j] = p[j - 1] * (k - j + 1) / j;
        }
        /*
            dp[turn][zheng]表示：
            当前已经有zheng枚硬币正面朝上
            还可以进行turn次操作时
            最终能够获得的正面硬币数量的最大期望
            dp[m,0]为ans
        */
        vector<vector<double>> dp(m+1,vector<double>(n+1,0.0));
        for (int zheng=0; zheng<=n;++zheng) {
            dp[0][zheng] = zheng;
        }
        for (int turn=1;turn<=m;++turn) {
            for (int zheng=0; zheng<=n;++zheng) {
                int szheng=max(0,k-(n-zheng));
                int dzheng=zheng - szheng;
                for (int j=0;j<=k;++j) {
                    int nzheng=dzheng+j;
                    dp[turn][zheng]+=p[j]*dp[turn - 1][nzheng];
                }
            }
        }
        cout<<fixed<<setprecision(3)<<dp[m][0]<<'\n';
    }
    return 0;
}