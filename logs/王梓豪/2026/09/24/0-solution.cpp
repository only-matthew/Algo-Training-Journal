#include <iostream>
#include <algorithm>
#include <vector>
using namespace std;
int main() {
    int n,m;
    cin >>n>>m;
    vector<vector<vector<vector<int>>>> dp(n + 1, vector<vector<vector<int>>>(m + 1, vector<vector<int>>(n + 1, vector<int>(m + 1, 0))));
    vector<vector<int>> a(n + 1, vector<int>(m + 1, 0)); 
    for(int i=1;i<=n;i++)
    {
        for(int j=1;j<=m;j++)
        cin>>a[i][j];
    }
    for (int i = 1; i <= n; ++i) {
        for (int j = 1; j <= m; ++j) {
            for (int k = 1; k <= n; ++k) {
                int l = i + j - k;
                if (l < 1 || l > m) continue;
                int max_val = max(max(dp[i-1][j][k-1][l], dp[i-1][j][k][l-1]),
                                  max(dp[i][j-1][k-1][l], dp[i][j-1][k][l-1]));

                dp[i][j][k][l] = max_val + a[i][j];
                if (i != k || j != l) {
                    dp[i][j][k][l] += a[k][l];
                }
            }
        }
    }
    cout << dp[n][m][n][m] << endl;
    return 0;
}