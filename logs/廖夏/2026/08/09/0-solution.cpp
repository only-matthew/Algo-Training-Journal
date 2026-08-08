#include<iostream>
#include<algorithm>
using namespace std;
int n;
int mem[3000 + 5];
int dfs(int x){
    mem[1] = 1;
    // cout << ++cnt << " : " << x << endl
    if (mem[x]) return mem[x];
    int res = 1;
    for (int i = 1; i <= x / 2; i++)
        res += dfs(i);
    mem[x] = res;
    return res;
}
int main(){
    cin >> n;
    cout << dfs(n);
    return 0;
}