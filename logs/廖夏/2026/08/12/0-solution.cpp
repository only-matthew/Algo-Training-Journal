#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 1e6 + 5;
const int MOD = 10000; // 题目要求输出最后 4 位
int f[MAXN];
int main(){
    int n; cin >> n;
    f[0] = 1; f[1] = 1; f[2] = 2;
    for (int i = 3; i <= n; i++){
        f[i] = (2 * f[i-1] + f[i-3]) % MOD;
    }
    cout << f[n];
    return 0;
}