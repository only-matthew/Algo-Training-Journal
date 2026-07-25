#include <bits/stdc++.h>
using namespace std;

bool isPrime(int x) {
    if (x < 2) return false;
    for (int i = 2; i * i <= x; i++)
        if (x % i == 0)
            return false;
    return true;
}

const int N = 25;
int a[N], answer, n, k;

void dfs(int now, int sum, int sid) {
    if (now == k) {
        if (isPrime(sum)) answer++;
        return;
    }

    for (int i = sid; i <= n - k + now + 1; i++)
        dfs(now + 1, sum + a[i], i + 1);
}

int main() {
    cin >> n >> k;
    for (int i = 1; i <= n; i++)
        cin >> a[i];

    dfs(0, 0, 1);
    cout << answer << '\n';
    return 0;
}