#include<iostream>
#include<algorithm>
#include<cmath>
#include<vector>
#include<queue>
using namespace std;
struct node{
    int floor, num;
};
int main(){
    int n, a, b; cin >> n >> a >> b;
    vector<int> k(n+5);
    vector<bool> vis(n + n);
    for (int i = 1; i <= n; i++) cin >> k[i];
    queue<node> q; q.push({a,0});
    int res = 1e9; vis[a] = true;
    while(!q.empty()){
        int floor = q.front().floor, num = q.front().num; q.pop();
        if (floor == b) {res = min(res, num); continue;}
        if (floor + k[floor] <= n && !vis[floor+k[floor]]) {vis[floor+k[floor]] = true;q.push({floor + k[floor], num+1});}
        if (floor - k[floor] >= 1 && !vis[floor-k[floor]]) {vis[floor-k[floor]] = true;q.push({floor - k[floor], num + 1});}
    }
    if (res == 1e9) cout << -1;
    else cout << res;
    return 0;
}



----------------------------分割线-------------------------------

#include<iostream>
#include<algorithm>
#include<cmath>
#include<vector>
#include<queue>
using namespace std;
struct node{
    int floor, num;
};
int main(){
    int n, a, b; cin >> n >> a >> b;
    vector<int> k(n+5);
    vector<bool> vis(n + n);
    for (int i = 1; i <= n; i++) cin >> k[i];
    queue<node> q; q.push({a,0});
    int res = 1e9; vis[a] = true;
    while(!q.empty()){
        int floor = q.front().floor, num = q.front().num; q.pop();
        if (floor == b) {res = num; break;}
        if (floor + k[floor] <= n && !vis[floor+k[floor]]) {vis[floor+k[floor]] = true;q.push({floor + k[floor], num+1});}
        if (floor - k[floor] >= 1 && !vis[floor-k[floor]]) {vis[floor-k[floor]] = true;q.push({floor - k[floor], num + 1});}
    }
    if (res == 1e9) cout << -1;
    else cout << res;
    return 0;
}