#include<iostream>
#include<algorithm>
#include<queue>
#include<cstring>
using namespace std;
const int MAXN = 405;
int a[MAXN][MAXN];
struct cord{
    int x,y;
};
int d[8][2] = {{1,2},{1,-2},{-1,2},{-1,-2},{2,1},{2,-1},{-2,1},{-2,-1}};
queue<cord> q;
int n, m, sx, sy;
int main(){
    ios::sync_with_stdio(0);
    cin.tie(0);cout.tie(0);
    memset(a, -1, sizeof(a));
    cin >> n >> m >> sx >> sy;
    a[sx][sy] = 0;
    q.push({sx,sy});
    while(!q.empty()){
        cord u = q.front(); q.pop();
        int ux = u.x, uy = u.y;
        for(int i = 0; i < 8; i++){
            int x_ = ux + d[i][0], y_ = uy + d[i][1]; 
            if (x_ >= 1 && x_ <= n && y_ >= 1 && y_ <= m && a[x_][y_] == -1){
                // cout << x_ <<" "<< y_ << endl;
                q.push({x_,y_});
                a[x_][y_] = a[ux][uy] + 1;
            }
        }
    }
    for (int i = 1; i <= n; i++){
        for (int j = 1; j <= m; j++){
            cout << a[i][j]; if (j < m) cout << " ";
        }
        cout << endl;
    }
    return 0;
}