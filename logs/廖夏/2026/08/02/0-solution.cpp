#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 10 + 5;
int a[MAXN], b[MAXN];
int n;
int dfs (int s_, int b_, int i, bool selected = false){
    if (i > n) {
        if (!selected) return 2147483647;
        else return abs(s_ - b_);
    }
    int skip = dfs(s_, b_, i + 1, selected);
    // int choose = dfs(s_ * a[i], b_ + b[i], i + 1);
    int choose = dfs(s_ * a[i], b_ + b[i], i + 1, true);
    return min(skip, choose);
}

int main(){
    cin >> n;
    for (int i = 1; i <= n; i++){
        cin >> a[i] >> b[i];
    }
    cout << dfs(1, 0, 1);
}