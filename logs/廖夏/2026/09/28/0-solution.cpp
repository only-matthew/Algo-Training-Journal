#include<iostream>
#include<algorithm>
#include<map>
using namespace std;
const int MAXN = 25;
int a[MAXN], n, k, ans;
bool is_prime(int x){
    if (x < 2) return 0;
    for (int i = 2; i * i <= x; i++)
        if (x % i == 0) return 0;
    return 1;
}
void dfs(int index, int cnt, int sum){
    if (index > n+1) return;
    if (cnt == k) {if (is_prime(sum)) ans++; return;}
    dfs(index + 1, cnt + 1, sum + a[index]);
    dfs(index + 1, cnt, sum);
}
int main(){
    cin >> n >> k;
    for (int i = 1; i <= n; i++) cin >> a[i];
    dfs(1, 0, 0);
    cout << ans;
    return 0;
}