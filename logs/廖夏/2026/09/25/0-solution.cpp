#include<iostream>
#include<algorithm>
#include<queue>
using namespace std;
const int MAXN = 305;
int m, mp[MAXN][MAXN];
bool vis[MAXN][MAXN];
struct Node{
    int x, y, t;
};
int dx[] = {0, 1, 0, -1};
int dy[] = {1, 0, -1, 0};
int main(){
    fill(&mp[0][0], &mp[0][0] + 305 * 305, 1005);
    cin >> m; 
    for (int i = 1; i <= m; i++){
        int x, y, t; cin >> x >> y >> t;
        mp[x][y] = min(mp[x][y], t);
        for (int k = 0; k < 4; k++) 
            if (x + dx[k] >= 0 && y + dy[k] >= 0)
                mp[x+dx[k]][y+dy[k]] = min(mp[x+dx[k]][y+dy[k]], t);
    }
    if (mp[0][0] == 0) {cout << -1; return 0;}
    queue<Node> q;
    q.push({0,0,0});
    Node u;
    while(!q.empty()){
        u = q.front(); q.pop();
        if (mp[u.x][u.y] == 1005) break;
        for (int i = 0; i < 4; i++){
            int x = u.x + dx[i], y = u.y + dy[i], t = u.t + 1;
            if (x >= 0 && y >= 0 && !vis[x][y] && mp[x][y] > t) {
                q.push({x, y, t});
                vis[x][y] = true;
            }
        }
    }
    if (mp[u.x][u.y] == 1005) cout << u.t;
    else cout << -1;
    return 0;
}