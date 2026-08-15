#include<iostream>
using namespace std;
const int MAXN = 100 + 5;
const int MAXM = 1000 + 5;
int a[MAXN];
long long dp[MAXN][MAXM];   // dp[i][j]: 前 i 道菜中恰好花 j 元的方案数
int main(){
    int n, m; cin >> n >> m;              // n 种菜, m 元
    for (int i = 1; i <= n; i++) {cin >> a[i];}
    dp[0][0] = 1;
    for (int i = 1; i <= n; i++){
        for (int j = 0; j <= m; j++){
            dp[i][j] = dp[i-1][j];                    // 不选第 i 道菜
            if (j >= a[i]) dp[i][j] += dp[i-1][j-a[i]]; // 选第 i 道菜
        }
    }
    cout << dp[n][m];
    return 0;
}