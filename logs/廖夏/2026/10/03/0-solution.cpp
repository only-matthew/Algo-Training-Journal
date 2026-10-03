#include<iostream>
#include<algorithm>
#include<vector>
using namespace std;
const int MAXN = 10;
//int is_ob[MAXN][MAXN];
int vis[MAXN][MAXN];
int sx, sy;
int fx, fy;
int n, m, t;
int ans;
int dx[] = {0, 1, -1, 0};
int dy[] = {1, 0, 0, -1};
void dfs(int cx, int cy){
//	printf("%d %d\n", cx, cy);
	if (cx == fx && cy == fy) {ans++; return;}
	for (int i = 0; i < 4; i++){
		int x = cx + dx[i];
		int y = cy + dy[i];
		if (x >= 1 && y >= 1 && x <= m && y <= n && !vis[x][y] /*&& !is_ob[x][y]*/){
			vis[x][y] = 1;
			dfs(x, y);
			vis[x][y] = 0;
		}
	}
}
int main(){
	cin >> n >> m >> t;
	cin >> sx >> sy >> fx >> fy;
	for (int i = 1; i <= t; i++) {
		int x, y;
		cin >> x >> y;
		vis[x][y] = 1;
	}
	vis[sx][sy] = 1;
//	is_ob[sx][sy] = 1;
	dfs(sx, sy);
	cout << ans;
	return 0;
}



/****下面的是AI代码********************/
#include <iostream>
#include <queue>
using namespace std;

int n, m, t;
int sx, sy, fx, fy;

bool obstacle[6][6];

int dx[] = {0, 0, 1, -1};
int dy[] = {1, -1, 0, 0};

struct State {
    int x, y;
    long long vis;
};

int id(int x, int y) {
    return (x - 1) * m + (y - 1);
}

int main() {
    cin >> n >> m >> t;
    cin >> sx >> sy >> fx >> fy;

    for (int i = 0; i < t; i++) {
        int x, y;
        cin >> x >> y;
        obstacle[x][y] = true;
    }

    queue<State> q;

    long long startMask = 1LL << id(sx, sy);
    q.push({sx, sy, startMask});

    int ans = 0;

    while (!q.empty()) {
        State u = q.front();
        q.pop();

        if (u.x == fx && u.y == fy) {
            ans++;
            continue;
        }

        for (int i = 0; i < 4; i++) {
            int x = u.x + dx[i];
            int y = u.y + dy[i];

            if (x < 1 || x > n || y < 1 || y > m)
                continue;

            if (obstacle[x][y])
                continue;

            int p = id(x, y);

            if (u.vis & (1LL << p))
                continue;

            q.push({
                x,
                y,
                u.vis | (1LL << p)
            });
        }
    }

    cout << ans;
}