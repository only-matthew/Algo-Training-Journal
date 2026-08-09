#include<iostream>
#include<algorithm>
using namespace std;
int f[3005];
int main(){
    f[1] = 1;
    int n; cin >> n;
    for (int i = 2; i <= n; i++){
        f[i] = 1;
        for (int j = 1; j <= i / 2; j++){
            f[i] += f[j];
        }
    }
    cout << f[n];
    return 0;
}