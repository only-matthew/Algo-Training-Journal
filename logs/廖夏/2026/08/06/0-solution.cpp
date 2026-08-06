#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 25;
int is[MAXN][MAXN], mp[MAXN];
int dx[] = {-1,-1,1,1,-2,-2,2,2};
int dy[] = {-2,2,-2,2,-1,1,-1,1};
long long f[MAXN][MAXN];
int main(){
    int n, m, x, y; cin >> n >> m >> x >> y;
    is[x][y] = true;
    for (int i = 0; i < 8; i++) {
        int nx = x + dx[i], ny = y + dy[i];
        if (nx >= 0 && nx <= n && ny >= 0 && ny <= m) is[nx][ny] = true;
    }
    f[0][0] = 1 - is[0][0];

    for (int i = 1; i <= n; i++) {if (!is[i][0]) f[i][0] = f[i-1][0]; else break;}
    for (int j = 1; j <= m; j++) {if (!is[0][j]) f[0][j] = f[0][j-1]; else break;}

    for (int i = 1; i <= n; i++){
        for (int j = 1; j <= m; j++){
            if (!is[i][j])
                f[i][j] = f[i-1][j] + f[i][j-1];
            else f[i][j]=0;
        }
    }
    cout << f[n][m];
    return 0;
}