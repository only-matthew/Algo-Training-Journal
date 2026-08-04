#include <iostream>
#include <vector>
#include <iomanip>
#include <cmath>
#include <unordered_set>
#include <map>
#include <algorithm>
#include <unordered_map>
#include <cstdio>
#include <string>
#include <set>
#include <queue>
using namespace std;
 
int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
 
    int t;
    cin >> t;
 
    while (t--) {
        int n;
        cin >> n;
 
        vector<long long> a(n);
        for (int i = 0; i < n; i++) {
            cin >> a[i];
        }
 
        vector<long long> b = a;
        sort(b.begin(), b.end());
 
        map<long long, long long> mp;
        long long curr = 0;
        long long total = 0, cnt = 0;
        bool flag = 1;
 
        if (b[0] != 0) {
            cout << -1 << '\n';
            continue;
        }
 
        for (int i = 0; i < n; i++) {
            // b[i] 和 b[i - 1] 不同时，说明进入了新的 shadow 分组
            if (i > 0 && b[i] != b[i - 1]) {
                if ((b[i] - total) % cnt != 0) {
                    flag = 0;
                    break;
                }
 
                long long x = (b[i] - total) / cnt;
 
                // 新恢复出的 a 值必须严格大于前一组的值
                if (x <= curr) {
                    flag = 0;
                    break;
                }
 
                curr = x;
                mp[b[i - 1]] = curr;
                total += curr * cnt;
                cnt = 1;
            } else {
                cnt++;
            }
        }
 
        if (!flag) {
            cout << -1 << '\n';
            continue;
        }
        mp[b[n - 1]] = curr + 1;
 
        for (int i = 0; i < n; i++) {
            cout << mp[a[i]] << " ";
        }
        cout << '\n';
    }
}