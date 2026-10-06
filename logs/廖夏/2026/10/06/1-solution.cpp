#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 105;
bool mp[MAXN][MAXN];
bool w[MAXN][MAXN];
int m, n, ans;
int dx[] = {0, 0, 1, 1, -1, -1, 1, -1};
int dy[] = {1, -1, 1, -1, 1, -1, 0, 0};
void dfs(int x, int y){
	w[x][y] = 1;
	for (int k = 0; k < 8; k++){
		int nx = x + dx[k], ny = y + dy[k];
		if (nx >= 1 && ny >= 1 && nx <= n && ny <= m && mp[nx][ny] && !w[nx][ny])
			dfs(nx, ny);
	}
}
int main(){
	cin >> n >> m;
	for (int i = 1; i <= n; i++){
		for (int j = 1; j <= m; j++){
			char c;
			cin >> c;
			if (c == 'W') mp[i][j] = 1;
		}
	}
	for (int i = 1; i <= n; i++){
		for (int j = 1; j <= m; j++){
			if (mp[i][j] && !w[i][j]) {
				ans++;
				dfs(i, j);
			}
		}
	}
	cout << ans;
	return 0;
}