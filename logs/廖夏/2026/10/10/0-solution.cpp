#include<iostream>
#include<algorithm>
#include<vector>
#include<cstring>
using namespace std;
const int MAXN = 35;
bool a[MAXN][MAXN];
bool vis[MAXN][MAXN];
int n;
int dx[] = {0, 0, 1, -1};
int dy[] = {1, -1, 0, 0};
bool dfs(int x, int y){
    vis[x][y] = true;
    if (a[x][y]) return 1;
    if (x == 1 || y == 1 || x == n || y == n) return 0;
    bool res = 1;
    for (int i = 0; i < 4; i++){
        int nx = x + dx[i], ny = y + dy[i];
        if (nx >= 1 && ny >= 1 && nx <= n && ny <= n && !vis[nx][ny]){
            // vis[nx][ny] = true;
            res = min(res, dfs(nx,ny));
            // vis[nx][ny] = false;
        }
    }
    return res;
}
int main(){
    cin >> n;
    for (int i = 1; i <= n; i++){
        for (int j = 1; j <= n; j++){
            cin >> a[i][j];
        }
    }
    for (int i = 1; i <= n; i++){
        for (int j = 1; j <= n; j++){
            if (i == 1 || j == 1 || i == n || j == n) {cout << a[i][j] << " "; continue;}
            memset(vis, 0, sizeof(vis));
            if (a[i][j]) cout << 1 << " ";
            else {
                vis[i][j] = true;
                cout << (dfs(i, j) ? 2 : 0) << " ";
            }
        }
        cout << endl;
    }
    return 0;
}