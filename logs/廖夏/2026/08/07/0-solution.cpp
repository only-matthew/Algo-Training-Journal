#include<iostream>
#include<algorithm>
using namespace std;
int h[20] = {1, 1};
int main(){
    int n; cin >> n;
    for (int i = 2; i <= n; i++){
        for (int j = 0; j < i; j++){
            h[i] += h[j] * h[i - j - 1];
        }
    }
    cout << h[n];
    return 0;
}

#include<iostream>
using namespace std;
int a[20][20], n;
int dfs(int i, int x){
    int res = 0;
    if (i == 2 * n) return x ? 0 : 1;
    if (a[i][x]) return a[i][x]; // 记忆化
    if (i < 2 * n) res += dfs(i + 1, x + 1);
    if (x) res += dfs(i + 1, x - 1);
    a[i][x] = res; // 记忆化
    return res;
}
int main(){
    cin >> n;
    cout << dfs(0, 0);
}