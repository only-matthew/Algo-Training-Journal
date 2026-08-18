#include<iostream>
#include<algorithm>
#include<cstring>
using namespace std;
int n; const int MAXN = 1050;
char a[MAXN][MAXN];
char tmp[MAXN][MAXN];
int main(){
    memset(a, ' ', sizeof(a));
    cin >> n;
    a[0][1] = a[1][0] = '/'; a[0][2] = a[1][3] = '\\'; a[1][1] = a[1][2] = '_';
    for (int k = 1; k < n; k++){
        int h = 1 << k;
        int w = 1 << (k+1);
        for (int i = 0; i < h; i++)
            for (int j = h - i - 1; j <= h + i; j++)
                tmp[i][j] = a[i][j];
        memset(a, ' ', sizeof(a));
        for (int i = 0; i < h; i++){
            for (int j = h - i - 1; j <= h + i; j++){
                a[i][j+h] = a[i+h][j] = a[i+h][j+w] = tmp[i][j];
                // a[i][j] = ' ';
            }
        }
    }
    for (int i = 0; i < (1 << n); i++){
        for (int j = 0; j < (1 << (n+1)); j++)
            cout << a[i][j];
        cout << "\n";
    }
}