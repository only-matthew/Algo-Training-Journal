#include<iostream>
#include<algorithm>
using namespace std;
int main(){
    int t; cin >> t;
    while(t--){
        int a[3];
        for (int i = 0; i < 3; i++) cin >> a[i];
        sort(a, a + 3);
        if (a[0] == a[1] || a[1] == a[2]) cout << 0 << endl;
        else cout << min(a[1] - a[0], a[2] - a[1]) << endl;
        // cout << a[0] << " " << a[1] <<" "<<a[2] << endl;
    }
}