#include<iostream>
#include<algorithm>
#include<cmath>
using namespace std;
const int MAXN = 1050;
// bool a[MAXN][MAXN];
int n;

void fill(int x, int y, int cenx, int ceny, int k){
    // printf("k : %d, cenx: %d, ceny: %d\n",k,cenx,ceny);
    // int cenx = k / 2, ceny = k / 2;
    if (x <= cenx && y <= ceny) {
        printf("%d %d %d\n", cenx + 1, ceny + 1, 1);
        // a[cenx + 1][ceny + 1] = true, a[cenx + 1][ceny] = true, a[cenx][ceny + 1] = true;
        if (k == 2) return; 
        else {
            fill(x, y, cenx - k / 4, ceny - k / 4, k / 2);
            fill(cenx, ceny + 1, cenx - k / 4, ceny + k / 4, k / 2);
            fill(cenx + 1, ceny, cenx + k / 4, ceny - k / 4, k / 2);
            fill(cenx+1,ceny+1,cenx+k/4,ceny+k/4,k/2); 
            return;
        }
    }
    if (x <= cenx && y > ceny) {
        printf("%d %d %d\n", cenx + 1, ceny, 2);
        // a[cenx + 1][ceny] = true, a[cenx][ceny] = true, a[cenx+1][ceny + 1] = true;
        if (k == 2) return;
        else{
            fill(cenx,ceny,cenx-k/4,ceny-k/4,k/2);
            fill(x,y,cenx-k/4,ceny+k/4,k/2);
            fill(cenx+1,ceny,cenx+k/4,ceny-k/4,k/2);
            fill(cenx+1,ceny+1,cenx+k/4,ceny+k/4,k/2);
            return;
        }
    }
    if (x > cenx && y <= ceny) {
        printf("%d %d %d\n", cenx, ceny + 1, 3);
        // a[cenx][ceny + 1] = true, a[cenx][ceny] = true, a[cenx+1][ceny + 1] = true;
        if (k == 2) return;
        else{
            fill(cenx,ceny,cenx-k/4,ceny-k/4,k/2);
            fill(cenx,ceny+1,cenx-k/4,ceny+k/4,k/2);
            fill(x,y,cenx+k/4,ceny-k/4,k/2);
            fill(cenx+1,ceny+1,cenx+k/4,ceny+k/4,k/2);
            return;
        }
    }
    if (x > cenx && y > ceny) {
        printf("%d %d %d\n", cenx, ceny , 4);
        // a[cenx][ceny] = true, a[cenx + 1][ceny] = true, a[cenx][ceny + 1] = true;
        if (k == 2) return;
        else{
            fill(cenx,ceny,cenx-k/4,ceny-k/4,k/2);
            fill(cenx,ceny+1,cenx-k/4,ceny+k/4,k/2);
            fill(cenx+1,ceny,cenx+k/4,ceny-k/4,k/2);
            fill(x,y,cenx+k/4,ceny+k/4,k/2);
            return;
        }
    }
    // if (k == 2) return;
}

int main(){
    int x, y;
    ios::sync_with_stdio(0); cin.tie(0); cout.tie(0);
    cin >> n >> x >> y; //a[x][y] = true;
    n = 1 << n;
    if (n == 0) {return 0;}
    fill(x, y, n / 2, n / 2, n);
    return 0;
}