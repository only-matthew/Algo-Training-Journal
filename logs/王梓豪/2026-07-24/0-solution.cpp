#include <iostream>
#include <vector>
#include <iomanip>
#include <cmath>
#include <unordered_set>
#include <map>
#include <algorithm>
#include<unordered_map>
#include <cstdio>
#include <string>
#include <set>
#include <queue>
using namespace std;
bool canMeet(long long s1, long long v1, long long s2, long long v2) {
    if (v1 == v2) {
        return s1 == s2;
    }
    long long ds = s2 - s1;
    long long dv = v1 - v2;
    if (ds == 0) return true;
    return (ds > 0 && dv > 0) || (ds < 0 && dv < 0);
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int N, K;
    cin >> N >> K;
    --K;

    vector<long long> S(N), V(N);
    for (int i = 0; i < N; ++i) cin >> S[i];
    for (int i = 0; i < N; ++i) cin >> V[i];

    vector<vector<int>> g(N);
    for (int i = 0; i < N; ++i) {
        for (int j = i + 1; j < N; ++j) {
            if (canMeet(S[i], V[i], S[j], V[j])) {
                g[i].push_back(j);
                g[j].push_back(i);
            }
        }
    }

    vector<int> vis(N, 0);
    queue<int> q;
    q.push(K);
    vis[K] = 1;
    int ans = 0;

    while (!q.empty()) {
        int u = q.front();
        q.pop();
        ++ans;
        for (int v : g[u]) {
            if (!vis[v]) {
                vis[v] = 1;
                q.push(v);
            }
        }
    }
    cout << ans << '\n';
    return 0;
}