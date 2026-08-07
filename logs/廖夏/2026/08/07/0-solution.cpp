#include<iostream>
#include<algorithm>
using namespace std;
int h[20] = {1, 1};
int main(){
    int n; cin >> n;
    for (int i = 2; i <= n; i++){
        for (int j = 0; j < i; j++){
            h[i] += h[j] * h[i - j - 1];
        }
    }
    cout << h[n];
    return 0;
}