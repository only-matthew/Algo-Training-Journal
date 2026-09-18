#include <iostream>
#include <algorithm>
#include <vector>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<vector<vector<vector<int>>>> dp(n + 1, vector<vector<vector<int>>>(n + 1, vector<vector<int>>(n + 1, vector<int>(n + 1, 0))));
    vector<vector<int>> a(n + 1, vector<int>(n + 1, 0)); 
    int x, y, num;
    while (cin >> x >> y >> num) {
        if (x == 0 && y == 0 && num == 0) break;
        a[x][y] = num;
    }
    for (int i = 1; i <= n; ++i) {
        for (int j = 1; j <= n; ++j) {
            for (int k = 1; k <= n; ++k) {
                int l = i + j - k;
                if (l < 1 || l > n) continue;
                int max_val = max(max(dp[i-1][j][k-1][l], dp[i-1][j][k][l-1]),
                                  max(dp[i][j-1][k-1][l], dp[i][j-1][k][l-1]));

                dp[i][j][k][l] = max_val + a[i][j];
                if (i != k || j != l) {
                    dp[i][j][k][l] += a[k][l];
                }
            }
        }
    }
    cout << dp[n][n][n][n] << endl;
    return 0;
}