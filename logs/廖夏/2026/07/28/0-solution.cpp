#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 55;
int R[MAXN], B[MAXN], W[MAXN];
int a[MAXN][MAXN];
int main(){
    int n, m;
    cin >> n >> m;
    for (int i = 1; i <=n; i ++){
        for (int j = 1; j <= m; j++){
            char c;
            cin >> c;
            if (c == 'R') a[i][j] = 1, B[i]++, W[i]++;
            else if(c == 'B') a[i][j] = 2, R[i]++, W[i]++;
            else a[i][j] = 3, R[i]++, B[i]++;
        }
    }
    // 重要思维模型，对于难以通过逻辑确认且数据量较小的问题，使用枚举法，同时对于互相约束且变量较小的问题，直接枚举前几个确认下一个
    // 现在暴力枚举W, B的行数，分别设为p, q
    int res = 100000000;
    for (int p = 1; p <= n - 2; p++){
        for (int q = 1; q <= n - p - 1; q++){
            // 得到了W， B，R的行数
            int lw = p, lb = q, lr = n - p - q;
            // 下面进行计算
            int tmp = 0;
            for (int i = 1; i <= lw; i++) tmp += W[i];
            for (int i = lw + 1; i <= lw + lb; i++) tmp += B[i];
            for (int i = lw + lb + 1; i <= lw + lb + lr; i++) tmp += R[i];
            res  = min(res, tmp);
        }
    }
    cout << res;
}