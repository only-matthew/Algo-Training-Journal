#include<iostream>
#include<cstring>
using namespace std;
int n;
char a[1050][1050];

void draw(int sz, int x, int y){
    if (sz == 1){
        a[x][y+1] = a[x+1][y] = '/';
        a[x][y+2] = a[x+1][y+3] = '\\';
        a[x+1][y+1] = a[x+1][y+2] = '_';
        return;
    }
    int h = 1 << (sz-1);
    int w = 1 << sz;
    draw(sz - 1, x, y + h);
    draw(sz-1,x+h,y);
    draw(sz-1,x+h,y+w);
}

int main(){
    ios::sync_with_stdio(0);
    cin.tie(0); cout.tie(0);
    memset(a, ' ', sizeof(a));
    cin >> n;
    draw(n, 0, 0);
    for (int i = 0; i < 1<<n; i++){
        for (int j = 0; j < 1 <<(n+1); j++)
            cout << a[i][j];
        cout << "\n";
    }
    return 0;
}