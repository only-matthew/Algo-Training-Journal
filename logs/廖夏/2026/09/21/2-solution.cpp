#include<iostream>
#include<algorithm>
#include<cmath>
using namespace std;
int main(){
    int a1, a2, a3;
    int t;
    cin >> t;
    while(t--){
        int n; cin >> n;
        cin >> a1 >> a2 >> a3;
        cout << n - min(a1,min(a2,a3)) << endl;
    }
    return 0;
}