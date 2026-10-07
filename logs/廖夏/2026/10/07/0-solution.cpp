// 初始诡异思路：路上更新->（修订）每个点都搜一遍

#include<iostream>
#include<algorithm>
#include<vector>
#include<cstring>
using namespace std;
const int MAXN = 35;
bool mp[MAXN][MAXN];
int val[MAXN][MAXN];
bool vis[MAXN][MAXN];
int n;
int dx[] = {0, 0, 1, -1};
int dy[] = {1, -1, 0, 0};
int dfs(int x, int y){
    // if (vis[x][y]) return val[x][y];
    vis[x][y] = true;
    if (mp[x][y]) return 2;
    else if (x == 1 || y == 1 || x == n || y == n) return 0;
    int res = 2;
    for (int k = 0; k < 4; k++){
        int nx = x + dx[k], ny = y + dy[k];
        if (nx >= 1 && ny >= 1 && nx <= n && ny <= n && !vis[nx][ny])
            res = min(dfs(nx, ny), res);
    }
    // val[x][y] = res;
    return res; 
}
int main(){
    cin >> n;
    for (int i = 1; i <= n; i++){
        for (int j = 1; j <= n; j++){
            cin >> mp[i][j];
        }
    }
    for (int i = 2; i < n; i++){
        for (int j = 2; j < n; j++){
            memset(vis, 0, sizeof(vis));
            if (!mp[i][j]){
                val[i][j] = dfs(i, j);
            }
            else if (mp[i][j]) val[i][j] = 1;
        }
    }
    for (int i = 1; i <= n; i++){
        for (int j  = 1; j <= n; j++){
            if (mp[i][j]) cout << 1;
            else cout << val[i][j];
            if (j < n) cout << " ";
        }
        cout << endl;
    }
    return 0;
}


// 标准“灌水”思路

#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 35;
bool vis[MAXN][MAXN];
bool mp[MAXN][MAXN];
int n;
int dx[] = {0, 0, 1, -1};
int dy[] = {1, -1, 0, 0};
void dfs(int x, int y){
    vis[x][y] = 1;
    for (int i = 0; i < 4; i++){
        int nx = x + dx[i], ny = y + dy[i];
        if (nx <= n + 1 && ny <= n + 1 && nx >= 0 && ny >= 0 && !mp[nx][ny] && !vis[nx][ny])
            dfs(nx, ny);
    }
}
int main(){
    cin >> n;
    for (int i = 1; i <= n; i++){
        for (int j = 1; j <= n; j++){
            cin >> mp[i][j];
        }
    }
    dfs(0,0);
    for (int i = 1; i <= n; i++){
        for (int j  = 1; j <= n; j++){
            if (vis[i][j]) cout << 0 << " ";
            else if (mp[i][j]) cout << 1 << " ";
            else cout << 2 << " "; 
        }
        cout << endl;
    }
}