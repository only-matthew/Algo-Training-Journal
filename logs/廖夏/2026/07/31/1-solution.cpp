#include <iostream>
#include <algorithm>
#include <set>
using namespace std;
const int MAXN = 5e3 + 5, M = 1e9 + 7;
int a[MAXN];
set <int> doubled;

int main() {
    long long res = 0;
    int n; cin >> n;
    for (int i = 0; i < n; i++){
        int x; cin >> x;
        a[x]++;
        if (a[x] >= 2) doubled.insert(x);
    }
    for (int x : doubled){
        long long legs = (1LL * a[x] * (a[x] - 1) / 2) % M; 
        for (int i = 1; i <= x / 2; i++){ // 为了避免重复计算
            int j = x - i;
            if (i == j) res += (legs * a[i] * (a[i] - 1) / 2) % M; // 如果两个相同 comb(2, a[i])
            else res += (legs* a[i] * a[j]) % M; // 两个不同，直接乘法原理
        }
        res %= M;
    }
    cout << res;
    return 0;
}