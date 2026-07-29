#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 100 + 5;
bool a[MAXN][MAXN];

// byRow = true: 按行扫描,  false: 按列扫描
int count_ways(int R, int C, int K, bool byRow){
    int outer = byRow ? R : C;
    int inner = byRow ? C : R;
    int res = 0;
    for (int i = 1; i <= outer; i++){
        // 下面开始计算第 i 行/列 存在多少个 连续 的空地（ bool 值为 1）
        int cnt = 0;
        for (int j = 1; j <= inner; j++){
            if (byRow ? a[i][j] : a[j][i]) cnt++;
            else 
                res += max(0, cnt - K + 1), cnt = 0;
        }
        res += max(0, cnt - K + 1);
    }
    return res;
}

int main(){
    int R, C, K; cin >> R >> C >> K;
    for (int i = 1; i <= R; i++){
        for (int j = 1; j <= C; j++){
            char c;
            cin >> c;
            if (c == '#') a[i][j] = 0;
            else a[i][j] = true; 
        }
    }
    // 容易想到可以使用横 + 竖的方法
    int res = count_ways(R, C, K, true) + count_ways(R, C, K, false);
    if (K == 1) res /= 2;
    cout << res;
    return 0;
}