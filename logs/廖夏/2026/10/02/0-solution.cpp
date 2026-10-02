#include<iostream>
#include<algorithm>
#include<cmath>
#include<iomanip>
#include<vector>
using namespace std;
const int MAXN = 25;
struct coord{
    double x,y;
};
coord a[MAXN];
int n;
bool vis[MAXN];
double ans = 1e9;
double dis[MAXN][MAXN];
vector<int> order[MAXN];
void dfs(int index, double distance, int cnt){
    if (distance >= ans) return;
    if (cnt == n){
        ans = min(ans, distance);
        return;
    }
    for (int i : order[index]){
        if (!vis[i]){
            vis[i] = 1;
            dfs(i, distance + dis[index][i], cnt + 1);
            vis[i] = 0;
        }
    }
} // O(n!) 及其恐怖
double greedy(){
    bool used[MAXN] = {};
    int now = 0;
    double res = 0;

    for (int k = 1; k <= n; k++){
        int nxt = -1;

        for (int i = 1; i <= n; i++){
            if (!used[i] && 
                (nxt == -1 || dis[now][i] < dis[now][nxt])){
                nxt = i;
            }
        }

        used[nxt] = true;
        res += dis[now][nxt];
        now = nxt;
    }

    return res;
}
int main(){
    cin >> n;
    for (int i = 1; i <= n; i++) cin >> a[i].x >> a[i].y;
    // dis 预处理
    for (int i = 0; i <= n; i++){
        for (int j = 0; j <= n; j++){
            if (i == j) continue;
            dis[i][j] = hypot(a[i].x-a[j].x,a[i].y-a[j].y);
        }
    }
    // order 预处理
    for (int i = 0; i <= n; i++){
        for (int j = 1; j <= n; j++)
            if (i != j){
                order[i].push_back(j);
        }
        sort(order[i].begin(), order[i].end(), [i](int x, int y){
            return dis[i][x] < dis[i][y];
        });
    }
    double ans_tmp = 0;
    ans = greedy();
    dfs(0, 0, 0); // a[0].x = a[0].y = 0
    cout << fixed << setprecision(2) << ans;
    return 0;
}