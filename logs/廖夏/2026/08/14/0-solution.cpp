#include<iostream>
#include<algorithm>
using namespace std;
const int MAXN = 105;
int a[MAXN*2], n;

void print(){
    for (int i = 1; i <= n * 2 + 2; i++){
        if (a[i] == 1) cout << "o";
        else if (a[i] == 2) cout << "*";
        else cout << "-";
    }
    cout << "\n";
}

int main(){
    cin >> n;
    for (int i = 1; i <= n; i++) a[i] = 1;
    for (int i = n + 1; i <= n * 2; i++) a[i] = 2;
    int l = n;
    print();
    while(true){
        if (l > 4){
            a[l] = a[l+1] = 0;
            a[2*l+1] = 1, a[2*l+2] = 2;
            print();

            a[l] = a[l+1] = 2, a[2*l - 1] = a[2*l] = 0;
            print();
        }
        if (l == 4){
            a[4] = a[5] = 0, a[9] = 1, a[10] = 2; print();
            a[8] = a[9] = 0, a[4] = 2, a[5] = 1; print();
            a[2] = a[3] = 0, a[8] = 1, a[9] = 1; print();
            a[7] = a[8] = 0, a[2] = 2, a[3] = 1; print();
            a[1] = a[2] = 0, a[7] = 1, a[8] = 2; print();
            break;
        }
        l--;
    }
    return 0;
}